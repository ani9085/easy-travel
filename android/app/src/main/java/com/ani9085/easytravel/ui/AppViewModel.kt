package com.ani9085.easytravel.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import com.ani9085.easytravel.data.Destinations
import com.ani9085.easytravel.data.DestinationProfile
import com.ani9085.easytravel.data.DevicePrefs
import com.ani9085.easytravel.data.GeoPoint
import com.ani9085.easytravel.data.ItemStatus
import com.ani9085.easytravel.data.ItineraryItem
import com.ani9085.easytravel.data.JournalEvent
import com.ani9085.easytravel.data.Timeline
import com.ani9085.easytravel.data.Trip
import com.ani9085.easytravel.data.TripCodec
import com.ani9085.easytravel.data.TripProfile
import com.ani9085.easytravel.data.TripStore
import com.ani9085.easytravel.data.markShared
import com.ani9085.easytravel.data.timeline
import com.ani9085.easytravel.data.withEvent
import com.ani9085.easytravel.data.withStatus
import com.ani9085.easytravel.util.Speaker
import com.ani9085.easytravel.work.PriceWatchWorker
import kotlinx.coroutines.flow.StateFlow
import java.time.Instant
import java.time.ZoneId

enum class Screen { Home, Plan, Translate, Money, Photo, Arrival, Help, Setup, Import }

data class Undo(val id: String, val status: ItemStatus, val statusAt: String?, val message: String)

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val store = TripStore.get(app)
    val trip: StateFlow<Trip> = store.trip
    val destinations = Destinations(app.assets.open("destinations.json").bufferedReader().use { it.readText() })
    val prefs = DevicePrefs(app)
    val speaker = Speaker(app)

    var screen by mutableStateOf(Screen.Home)
        private set
    private val history = ArrayDeque<Screen>()

    fun open(next: Screen) {
        if (next == screen) return
        history.addLast(screen)
        screen = next
    }

    /** 휴대폰 뒤로 버튼. 처음 화면이면 false(앱 닫기). */
    fun back(): Boolean {
        val previous = history.removeLastOrNull() ?: return false
        screen = previous
        return true
    }

    fun home() {
        history.clear()
        screen = Screen.Home
    }

    fun profile(): DestinationProfile = destinations.profileFor(trip.value.profile.destination)

    fun zone(): ZoneId = profile().timeZone?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()

    fun timelineNow(): Timeline = timeline(trip.value.profile, Instant.now(), zone())

    // --- 보호자 웹에서 보낸 여행 가져오기 ---------------------------------------------
    var pendingImport by mutableStateOf<Trip?>(null)
        private set
    var importError by mutableStateOf<String?>(null)
        private set

    fun offerImport(input: String) {
        val payload = TripCodec.extractPayload(input)
        val decoded = payload?.let { TripCodec.decodeShare(it, Instant.now().toString()) }
        if (decoded == null) {
            pendingImport = null
            importError = "링크를 읽지 못했어요. 보호자에게 받은 링크 전체를 다시 붙여넣어 주세요."
        } else {
            importError = null
            pendingImport = decoded
        }
        if (screen != Screen.Import) open(Screen.Import)
    }

    fun confirmImport() {
        pendingImport?.let(store::replace)
        pendingImport = null
        home()
    }

    fun cancelImport() {
        pendingImport = null
        importError = null
    }

    // --- 일정 진행 -------------------------------------------------------------------
    var undo by mutableStateOf<Undo?>(null)
        private set

    fun mark(item: ItineraryItem, status: ItemStatus, message: String) {
        undo = Undo(item.id, item.status, item.statusAt, message)
        store.update { it.withStatus(item.id, status, Instant.now().toString()) }
    }

    fun revert() {
        val last = undo ?: return
        store.update { trip -> trip.copy(itinerary = trip.itinerary.map { if (it.id == last.id) it.copy(status = last.status, statusAt = last.statusAt) else it }) }
        undo = null
    }

    fun clearUndo() {
        undo = null
    }

    // --- 기록·공유 -------------------------------------------------------------------
    fun record(type: String, location: GeoPoint?): JournalEvent {
        val event = JournalEvent("$type-${System.currentTimeMillis()}", type, Instant.now().toString(), location)
        store.update { it.withEvent(event) }
        return event
    }

    fun markShared(id: String) = store.update { it.markShared(id) }

    // --- 보호자 설정 -------------------------------------------------------------------
    fun updateProfile(change: (TripProfile) -> TripProfile) = store.update { it.copy(profile = change(it.profile)) }

    fun addItem(day: Int, name: String, note: String = "") {
        val value = name.trim()
        if (value.isEmpty()) return
        store.update { it.copy(itinerary = it.itinerary + ItineraryItem("user-${System.currentTimeMillis()}", day, value, note)) }
    }

    fun removeItem(id: String) = store.update { trip -> trip.copy(itinerary = trip.itinerary.filterNot { it.id == id }) }

    fun setPriceWatch(enabled: Boolean, target: Long?) {
        store.update { it.copy(priceWatch = it.priceWatch.copy(enabled = enabled, targetPrice = target)) }
        PriceWatchWorker.schedule(getApplication(), enabled)
    }

    fun clearTrip() {
        store.update { Trip() }
        PriceWatchWorker.schedule(getApplication(), false)
    }

    override fun onCleared() {
        speaker.shutdown()
    }
}
