package com.ani9085.easytravel.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.time.Instant

/** 여행 하나를 이 휴대폰에 저장한다. 데이터가 끊긴 해외에서도 일정·숙소·연락처를 볼 수 있게 한다. */
class TripStore private constructor(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("trip", Context.MODE_PRIVATE)
    private val state = MutableStateFlow(TripCodec.fromJson(prefs.getString(KEY, null)) ?: Trip())
    val trip: StateFlow<Trip> = state.asStateFlow()

    @Synchronized
    fun update(change: (Trip) -> Trip) {
        val next = change(state.value).copy(updatedAt = Instant.now().toString())
        prefs.edit().putString(KEY, TripCodec.toJson(next)).apply()
        state.value = next
    }

    /** 가져온 여행으로 바꾸되, 이 휴대폰의 기록(안부·도착)과 가격 감시 설정은 유지한다. */
    fun replace(trip: Trip) = update { current ->
        trip.copy(priceWatch = current.priceWatch, journal = current.journal, lastCheckinAt = current.lastCheckinAt)
    }

    companion object {
        private const val KEY = "trip-v1"

        @Volatile private var instance: TripStore? = null

        fun get(context: Context): TripStore = instance ?: synchronized(this) {
            instance ?: TripStore(context).also { instance = it }
        }
    }
}

/** 기기 설정·캐시(환율). 여행 데이터가 아니라 따로 둔다. */
class DevicePrefs(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("device", Context.MODE_PRIVATE)

    fun rate(code: String): Pair<Double, String>? {
        val value = prefs.getFloat("rate-$code", -1f)
        val date = prefs.getString("rate-date-$code", null) ?: return null
        return if (value > 0) value.toDouble() to date else null
    }

    fun saveRate(code: String, rate: Double, refDate: String) {
        prefs.edit().putFloat("rate-$code", rate.toFloat()).putString("rate-date-$code", refDate).apply()
    }
}
