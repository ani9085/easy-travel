package com.ani9085.easytravel.net

import com.ani9085.easytravel.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL

sealed interface ApiResult {
    data class Ok(val text: String) : ApiResult
    data class Fail(val message: String, val code: String? = null) : ApiResult
}

data class FlightQuote(val bestPrice: Double, val currency: String, val count: Int)

sealed interface FlightResult {
    data class Ok(val quote: FlightQuote?) : FlightResult
    data class Fail(val message: String, val code: String? = null) : FlightResult
}

/**
 * easy-travel 서버(Vercel)의 /api/ai, /api/flights/search.
 * 서버는 같은 사이트에서 온 요청만 받으므로 사이트 주소를 Origin으로 보내고,
 * 서버가 가족 접속 코드를 요구하면 빌드 때 넣은 코드를 함께 보낸다. OpenRouter·Duffel 키는 앱에 없다.
 */
object Api {
    private val base = BuildConfig.API_BASE_URL

    private fun post(path: String, body: JSONObject): Pair<Int, JSONObject?> {
        val connection = (URL(base + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 35_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Origin", base)
            if (BuildConfig.FAMILY_ACCESS_CODE.isNotBlank()) setRequestProperty("x-easy-travel-code", BuildConfig.FAMILY_ACCESS_CODE)
        }
        try {
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            return status to (try { JSONObject(text) } catch (_: Exception) { null })
        } finally {
            connection.disconnect()
        }
    }

    private suspend fun ai(body: JSONObject): ApiResult = withContext(Dispatchers.IO) {
        try {
            val (status, json) = post("/api/ai", body)
            val result = json?.optString("result").orEmpty()
            if (status in 200..299 && result.isNotBlank()) ApiResult.Ok(result)
            else ApiResult.Fail(json?.optString("error")?.ifBlank { null } ?: "AI 서버가 답하지 않았어요. ($status)", json?.optString("code"))
        } catch (_: SocketTimeoutException) {
            ApiResult.Fail("AI 응답이 너무 늦어요. 잠시 뒤 다시 해 주세요.")
        } catch (_: IOException) {
            ApiResult.Fail("인터넷에 연결되지 않았어요. 자주 쓰는 말이나 직접 입력을 써 주세요.")
        }
    }

    suspend fun translate(text: String, destination: String, toKorean: Boolean, language: String): ApiResult =
        ai(JSONObject().put("task", "translate").put("text", text).put("destination", destination)
            .put("direction", if (toKorean) "to_korean" else "to_local").put("language", language))

    suspend fun photoLocation(dataUrl: String, destination: String): ApiResult =
        ai(JSONObject().put("task", "photo_location").put("image", dataUrl).put("destination", destination))

    /** 인원 전체 왕복 최저가. 서버에 Duffel 토큰이 없으면 Fail(code=flight_provider_not_configured). */
    suspend fun searchFlights(origin: String, destination: String, departureDate: String, returnDate: String, adults: Int): FlightResult =
        withContext(Dispatchers.IO) {
            try {
                val body = JSONObject().put("originIata", origin).put("destinationIata", destination)
                    .put("departureDate", departureDate).put("returnDate", returnDate).put("adults", adults)
                val (status, json) = post("/api/flights/search", body)
                if (status !in 200..299 || json == null) return@withContext FlightResult.Fail(json?.optString("error")?.ifBlank { null } ?: "항공 조회에 실패했어요. ($status)", json?.optString("code"))
                val offers = json.optJSONArray("offers")
                var best: Double? = null
                var currency = ""
                if (offers != null) for (i in 0 until offers.length()) {
                    val offer = offers.optJSONObject(i) ?: continue
                    val price = offer.optDouble("totalPrice", Double.NaN)
                    if (!price.isNaN() && (best == null || price < best)) {
                        best = price
                        currency = offer.optString("currency")
                    }
                }
                FlightResult.Ok(best?.let { FlightQuote(it, currency, offers?.length() ?: 0) })
            } catch (_: IOException) {
                FlightResult.Fail("인터넷에 연결되지 않아 항공 가격을 확인하지 못했어요.")
            }
        }
}

/** ECB 기준환율(Frankfurter). 정보 제공용이며 실제 환전·카드 환율과 다를 수 있다. */
object Rates {
    data class Rate(val krw: Double, val refDate: String)

    suspend fun fetch(code: String): Rate? = withContext(Dispatchers.IO) {
        try {
            val connection = (URL("https://api.frankfurter.dev/v1/latest?base=$code&symbols=KRW").openConnection() as HttpURLConnection).apply {
                connectTimeout = 10_000
                readTimeout = 10_000
            }
            try {
                if (connection.responseCode != 200) return@withContext null
                val json = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                val krw = json.optJSONObject("rates")?.optDouble("KRW", Double.NaN) ?: Double.NaN
                val date = json.optString("date")
                if (krw.isNaN() || krw <= 0 || date.isBlank()) null else Rate(krw, date)
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            null
        }
    }
}
