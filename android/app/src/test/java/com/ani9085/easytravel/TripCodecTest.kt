package com.ani9085.easytravel

import com.ani9085.easytravel.data.Destinations
import com.ani9085.easytravel.data.GeoPoint
import com.ani9085.easytravel.data.ItemStatus
import com.ani9085.easytravel.data.ItineraryItem
import com.ani9085.easytravel.data.JournalEvent
import com.ani9085.easytravel.data.PriceWatch
import com.ani9085.easytravel.data.Trip
import com.ani9085.easytravel.data.TripCodec
import com.ani9085.easytravel.data.TripProfile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class TripCodecTest {
    private val now = "2026-11-01T00:00:00Z"

    @Test fun `저장한 여행을 그대로 다시 읽는다`() {
        val trip = Trip(
            profile = TripProfile(destination = "도쿄, 일본", startDate = "2026-11-06", endDate = "2026-11-10", travelers = 2, hotel = "신주쿠", originIata = "ICN", destinationIata = "HND"),
            itinerary = listOf(ItineraryItem("1", 2, "센소지", "오전", ItemStatus.ARRIVED, now, "import")),
            journal = listOf(JournalEvent("e", "hotel_arrival", now, GeoPoint(35.69, 139.7, 30), true)),
            priceWatch = PriceWatch(enabled = true, targetPrice = 900000, lastStatus = "확인 전"),
            updatedAt = now
        )
        assertEquals(trip, TripCodec.fromJson(TripCodec.toJson(trip)))
    }

    @Test fun `깨진 저장값·다른 버전은 버린다`() {
        assertNull(TripCodec.fromJson("{not json"))
        assertNull(TripCodec.fromJson("""{"schemaVersion":2}"""))
        val odd = TripCodec.fromJson("""{"schemaVersion":1,"profile":{"travelers":99},"itinerary":[{"name":""},{"name":"A","day":99,"status":"flying"}],"journal":[{"type":"teleport","at":"x"}]}""")!!
        assertEquals(12, odd.profile.travelers)
        assertEquals(listOf(30), odd.itinerary.map { it.day })
        assertEquals(ItemStatus.PLANNED, odd.itinerary[0].status)
        assertTrue(odd.journal.isEmpty())
    }

    @Test fun `웹이 만든 링크를 읽는다 (share-fixture)`() {
        val payload = File("src/test/resources/share-fixture.txt").readText().trim()
        for (link in listOf(payload, "https://easy-travel-dosl.vercel.app/send#$payload", "easytravel://import?d=$payload", "받은 글\nhttps://x.app/send#$payload")) {
            val trip = TripCodec.extractPayload(link)?.let { TripCodec.decodeShare(it, now) }
            assertNotNull(link, trip)
            trip!!
            assertEquals("도쿄, 일본", trip.profile.destination)
            assertEquals("엄마", trip.profile.travelerName)
            assertEquals(listOf("신주쿠 교엔", "센소지"), trip.itinerary.map { it.name })
            assertTrue(trip.itinerary.all { it.status == ItemStatus.PLANNED && it.source == "import" })
            assertEquals(now, trip.importedAt)
        }
    }

    @Test fun `앱이 만든 링크와 웹 형식이 같다`() {
        val trip = Trip(profile = TripProfile(destination = "오사카"), itinerary = listOf(ItineraryItem("x", 1, "도톤보리")))
        val decoded = TripCodec.decodeShare(TripCodec.encodeShare(trip), now)!!
        assertEquals("오사카", decoded.profile.destination)
        assertEquals("도톤보리", decoded.itinerary.single().name)
    }

    @Test fun `여행지가 없거나 깨진 링크는 거절`() {
        assertNull(TripCodec.decodeShare("@@@", now))
        assertNull(TripCodec.decodeShare(TripCodec.encodeShare(Trip()), now))
        assertNull(TripCodec.extractPayload("안녕하세요"))
    }

    @Test fun `목적지 데이터 - 도쿄는 일본어·엔·도쿄 시간대, 모르는 곳은 영어`() {
        val destinations = Destinations(File("src/main/assets/destinations.json").readText())
        val japan = destinations.profileFor("도쿄, 일본")
        assertEquals("ja-JP", japan.speechLang)
        assertEquals("JPY", japan.currency)
        assertEquals("Asia/Tokyo", japan.timeZone)
        assertTrue(japan.phrases.size >= 4)
        assertEquals("other", destinations.profileFor("로마").id)
        assertEquals("en", destinations.suggestedLanguage("로마").code)
        assertEquals("ja", destinations.suggestedLanguage("오사카").code)
    }
}
