package com.ani9085.easytravel.data

import org.json.JSONArray
import org.json.JSONObject
import java.util.Base64

// 저장(JSON)과 "부모님 앱으로 보내기" 링크 해석. 모양이 이상한 값은 버리고 안전한 기본값으로 채운다.
object TripCodec {

    private fun JSONObject.str(key: String, max: Int = 200): String =
        if (has(key) && !isNull(key)) optString(key, "").take(max) else ""

    private fun JSONObject.strOrNull(key: String): String? =
        if (has(key) && !isNull(key)) optString(key, "").ifBlank { null } else null

    private fun clampTravelers(value: Int) = value.coerceIn(1, MAX_TRAVELERS)

    fun profileFrom(json: JSONObject?): TripProfile {
        val data = json ?: JSONObject()
        return TripProfile(
            destination = data.str("destination", 120),
            departure = data.str("departure", 120),
            originIata = data.str("originIata", 3).uppercase(),
            destinationIata = data.str("destinationIata", 3).uppercase(),
            startDate = data.str("startDate", 10),
            endDate = data.str("endDate", 10),
            travelers = clampTravelers(data.optInt("travelers", 1)),
            hotel = data.str("hotel", 160),
            emergencyNumber = data.str("emergencyNumber", 20),
            travelerName = data.str("travelerName", 20)
        )
    }

    private fun profileJson(p: TripProfile) = JSONObject()
        .put("destination", p.destination).put("departure", p.departure)
        .put("originIata", p.originIata).put("destinationIata", p.destinationIata)
        .put("startDate", p.startDate).put("endDate", p.endDate).put("travelers", p.travelers)
        .put("hotel", p.hotel).put("emergencyNumber", p.emergencyNumber).put("travelerName", p.travelerName)

    private fun itemsFrom(array: JSONArray?, fallbackSource: String): List<ItineraryItem> {
        if (array == null) return emptyList()
        return (0 until array.length()).mapNotNull { index ->
            val item = array.optJSONObject(index) ?: return@mapNotNull null
            val name = item.str("name", 120).trim()
            if (name.isEmpty()) return@mapNotNull null
            ItineraryItem(
                id = item.str("id", 80).ifBlank { "$fallbackSource-$index" },
                day = item.optInt("day", 1).coerceIn(1, MAX_TRIP_DAYS),
                name = name,
                note = item.str("note", 200),
                status = ItemStatus.from(item.strOrNull("status")),
                statusAt = item.strOrNull("statusAt"),
                source = item.str("source", 20).ifBlank { fallbackSource }
            )
        }
    }

    fun toJson(trip: Trip): String {
        val items = JSONArray()
        trip.itinerary.forEach {
            items.put(JSONObject().put("id", it.id).put("day", it.day).put("name", it.name).put("note", it.note)
                .put("status", it.status.wire).put("statusAt", it.statusAt ?: JSONObject.NULL).put("source", it.source))
        }
        val journal = JSONArray()
        trip.journal.forEach { event ->
            val location = event.location?.let { JSONObject().put("lat", it.lat).put("lng", it.lng).put("accuracy", it.accuracy) }
            journal.put(JSONObject().put("id", event.id).put("type", event.type).put("at", event.at)
                .put("location", location ?: JSONObject.NULL).put("shareOpened", event.shareOpened))
        }
        val watch = trip.priceWatch
        val watchJson = JSONObject().put("enabled", watch.enabled)
            .put("targetPrice", watch.targetPrice ?: JSONObject.NULL)
            .put("lastCheckedAt", watch.lastCheckedAt ?: JSONObject.NULL)
            .put("lastBestPrice", watch.lastBestPrice ?: JSONObject.NULL)
            .put("lastCurrency", watch.lastCurrency ?: JSONObject.NULL)
            .put("lastStatus", watch.lastStatus ?: JSONObject.NULL)
        return JSONObject()
            .put("schemaVersion", 1)
            .put("profile", profileJson(trip.profile))
            .put("itinerary", items)
            .put("journal", journal)
            .put("lastCheckinAt", trip.lastCheckinAt ?: JSONObject.NULL)
            .put("priceWatch", watchJson)
            .put("importedAt", trip.importedAt ?: JSONObject.NULL)
            .put("updatedAt", trip.updatedAt)
            .toString()
    }

    fun fromJson(raw: String?): Trip? {
        if (raw.isNullOrBlank()) return null
        return try {
            val data = JSONObject(raw)
            if (data.optInt("schemaVersion", 0) != 1) return null
            val journalArray = data.optJSONArray("journal") ?: JSONArray()
            val journal = (0 until journalArray.length()).mapNotNull { index ->
                val event = journalArray.optJSONObject(index) ?: return@mapNotNull null
                val type = event.str("type", 20)
                val at = event.strOrNull("at") ?: return@mapNotNull null
                if (type !in setOf("checkin", "hotel_arrival", "help")) return@mapNotNull null
                val loc = event.optJSONObject("location")?.let { l ->
                    if (l.has("lat") && l.has("lng")) GeoPoint(l.optDouble("lat"), l.optDouble("lng"), l.optInt("accuracy", 0)) else null
                }
                JournalEvent(event.str("id", 80).ifBlank { "event-$index" }, type, at, loc, event.optBoolean("shareOpened", false))
            }.takeLast(MAX_JOURNAL_EVENTS)
            val watch = data.optJSONObject("priceWatch") ?: JSONObject()
            Trip(
                profile = profileFrom(data.optJSONObject("profile")),
                itinerary = itemsFrom(data.optJSONArray("itinerary"), "user"),
                journal = journal,
                lastCheckinAt = data.strOrNull("lastCheckinAt"),
                priceWatch = PriceWatch(
                    enabled = watch.optBoolean("enabled", false),
                    targetPrice = if (watch.has("targetPrice") && !watch.isNull("targetPrice")) watch.optLong("targetPrice").takeIf { it > 0 } else null,
                    lastCheckedAt = watch.strOrNull("lastCheckedAt"),
                    lastBestPrice = if (watch.has("lastBestPrice") && !watch.isNull("lastBestPrice")) watch.optDouble("lastBestPrice") else null,
                    lastCurrency = watch.strOrNull("lastCurrency"),
                    lastStatus = watch.strOrNull("lastStatus")
                ),
                importedAt = data.strOrNull("importedAt"),
                updatedAt = data.str("updatedAt", 40)
            )
        } catch (_: Exception) {
            null
        }
    }

    // --- 보호자 웹 → 부모님 앱 링크 ------------------------------------------------
    // 형식: base64url(UTF-8 JSON {v:1, profile, itinerary:[{day,name,note}], sentAt})
    // 링크: https://<사이트>/send#<payload> 또는 easytravel://import?d=<payload>

    const val MAX_PAYLOAD_CHARS = 20_000

    /** 붙여넣은 글·링크에서 payload만 꺼낸다. */
    fun extractPayload(input: String): String? {
        val text = input.trim()
        if (text.isEmpty()) return null
        Regex("""[?&]d=([A-Za-z0-9_\-]+)""").find(text)?.let { return it.groupValues[1] }
        Regex("""/send#([A-Za-z0-9_\-]+)""").find(text)?.let { return it.groupValues[1] }
        return text.takeIf { Regex("""[A-Za-z0-9_\-]{8,}""").matches(it) }
    }

    /** 링크 payload를 새 여행으로 바꾼다. 기록·상태는 비우고, 장소는 '예정'으로 시작한다. */
    fun decodeShare(payload: String, now: String): Trip? {
        if (payload.length > MAX_PAYLOAD_CHARS) return null
        return try {
            val json = String(Base64.getUrlDecoder().decode(payload.trimEnd('=')), Charsets.UTF_8)
            val data = JSONObject(json)
            if (data.optInt("v", 0) != 1) return null
            val profile = profileFrom(data.optJSONObject("profile"))
            if (profile.destination.isBlank()) return null
            val items = itemsFrom(data.optJSONArray("itinerary"), "import")
                .mapIndexed { index, item -> item.copy(id = "import-$index", status = ItemStatus.PLANNED, statusAt = null, source = "import") }
            Trip(profile = profile, itinerary = items, importedAt = now, updatedAt = now)
        } catch (_: Exception) {
            null
        }
    }

    /** 테스트·디버그용: 웹과 같은 형식으로 만든다. */
    fun encodeShare(trip: Trip): String {
        val items = JSONArray()
        trip.itinerary.forEach { items.put(JSONObject().put("day", it.day).put("name", it.name).put("note", it.note)) }
        val json = JSONObject().put("v", 1).put("profile", profileJson(trip.profile)).put("itinerary", items).toString()
        return Base64.getUrlEncoder().withoutPadding().encodeToString(json.toByteArray(Charsets.UTF_8))
    }
}
