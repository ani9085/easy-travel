package com.ani9085.easytravel.ui.screens

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.ani9085.easytravel.data.JournalEvent
import com.ani9085.easytravel.data.Trip
import com.ani9085.easytravel.data.dialable
import com.ani9085.easytravel.data.lastEvent
import com.ani9085.easytravel.data.subjectOf
import com.ani9085.easytravel.ui.AppViewModel
import com.ani9085.easytravel.ui.components.BigButton
import com.ani9085.easytravel.ui.components.Kind
import com.ani9085.easytravel.ui.components.Notice
import com.ani9085.easytravel.ui.components.Panel
import com.ani9085.easytravel.ui.components.ScreenFrame
import com.ani9085.easytravel.ui.components.Tone
import com.ani9085.easytravel.ui.theme.Palette
import com.ani9085.easytravel.ui.theme.Type
import com.ani9085.easytravel.util.Actions
import com.ani9085.easytravel.util.Locator
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// 외교부 영사콜센터(해외에서 거는 한국 번호). 출처: 외교부 해외안전여행 https://0404.go.kr/
private const val CONSULAR = "+82-2-3210-0404"

private val TIME = DateTimeFormatter.ofPattern("M월 d일 a h:mm", Locale.KOREAN)

fun timeText(iso: String?): String =
    iso?.let { runCatching { TIME.format(Instant.parse(it).atZone(ZoneId.systemDefault())) }.getOrNull() } ?: "아직 기록 없음"

private fun hasLocation(context: Context) =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

/** 가족에게 보낼 글. 앱은 판단하지 않고, 부모님이 직접 알렸다는 사실만 적는다. */
private fun messageFor(trip: Trip, event: JournalEvent?, kind: String): String {
    val who = subjectOf(trip.profile.travelerName)
    val time = timeText(event?.at ?: Instant.now().toString())
    val body = when (kind) {
        "arrival" -> "$who ${time}에 숙소${trip.profile.hotel.takeIf { it.isNotBlank() }?.let { "($it)" } ?: ""} 도착을 직접 알렸어요."
        "checkin" -> "$who ${time}에 ‘잘 지내고 있어요’ 안부를 보냈어요."
        else -> "$who ${time}에 도움이 필요하다고 알렸어요. 전화 부탁해요."
    }
    val where = event?.location?.let { "\n위치(오차 약 ${it.accuracy}m): ${Actions.mapsLink(it)}" } ?: ""
    return "[이지트래블] $body$where"
}

/** "지금 위치도 함께" 체크: 고르는 순간에만 권한을 묻는다. */
@Composable
private fun LocationOptIn(checked: Boolean, onChange: (Boolean) -> Unit, label: String, onDenied: () -> Unit) {
    val context = LocalContext.current
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants.values.any { it }) onChange(true) else { onChange(false); onDenied() }
    }
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.heightIn(min = 56.dp)) {
        Checkbox(checked = checked, onCheckedChange = { on ->
            if (on && !hasLocation(context)) ask.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
            else onChange(on)
        })
        Text(label, style = Type.BodyBold, color = Palette.Ink)
    }
}

@Composable
fun ArrivalScreen(vm: AppViewModel, trip: Trip) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var withLocation by rememberSaveable { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var recorded by remember { mutableStateOf<JournalEvent?>(null) }
    var notice by remember { mutableStateOf("") }
    val last = trip.lastEvent("hotel_arrival")

    ScreenFrame(subtitle = subtitleFor(trip, vm.timelineNow()), title = "숙소 도착 알리기", onBack = vm::home) {
        Text("숙소에 도착하면 아래 버튼을 눌러 주세요. 이 휴대폰에 기록하고, 원하면 카카오톡으로 가족에게 알릴 수 있어요.", style = Type.Body, color = Palette.Ink)
        Panel {
            Text("숙소", style = Type.Label, color = Palette.Muted)
            Text(trip.profile.hotel.ifBlank { "아직 숙소가 없어요 · ‘설정’에서 넣어 주세요" }, style = Type.BodyBold, color = Palette.Ink)
            if (trip.profile.hotel.isNotBlank()) BigButton("🏨 숙소로 가는 길", { Actions.directions(context, trip.profile.hotel) }, kind = Kind.Secondary)
        }
        LocationOptIn(withLocation, { withLocation = it }, "지금 위치도 함께 기록하기 (선택)") { notice = "위치 권한이 없어 위치 없이 기록해요." }
        val event = recorded
        if (event == null) {
            BigButton(if (busy) "기록하는 중…" else "🛎️ 숙소에 도착했어요", {
                busy = true
                scope.launch {
                    val location = if (withLocation && hasLocation(context)) Locator.once(context) else null
                    recorded = vm.record("hotel_arrival", location)
                    if (withLocation && location == null) notice = "위치를 받지 못했어요(위치 켜짐·신호를 확인해 주세요). 기록은 남겼어요."
                    busy = false
                }
            }, enabled = !busy, huge = true)
        } else {
            Notice("${timeText(event.at)}에 숙소 도착을 기록했어요.\n" + (event.location?.let { "위치도 함께 기록했어요(오차 약 ${it.accuracy}m). 숙소 위치와 비교하지는 않아요." } ?: "위치는 기록하지 않았어요."), Tone.Success)
        }
        val shareTarget = recorded ?: last
        if (shareTarget != null) {
            BigButton("카카오톡으로 가족에게 알리기", {
                if (Actions.shareToFamily(context, messageFor(trip, shareTarget, "arrival"))) {
                    vm.markShared(shareTarget.id)
                    notice = "카카오톡에서 가족을 고르고 ‘전송’을 눌러야 전달돼요."
                }
            }, kind = Kind.Kakao, huge = true)
        }
        if (notice.isNotEmpty()) Notice(notice)
        if (recorded == null && last != null) Text("마지막 숙소 도착 기록: ${timeText(last.at)}${if (last.shareOpened) " · 공유 창을 열었어요" else ""}", style = Type.Small, color = Palette.Muted)
        Text("‘전송’을 눌러야 가족에게 전달돼요. 앱은 실제로 전달됐는지 알 수 없어요. 가족이 확인하지 못해도 위험하다는 뜻은 아니에요.", style = Type.Small, color = Palette.Muted)
    }
}

@Composable
fun HelpScreen(vm: AppViewModel, trip: Trip) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var withLocation by rememberSaveable { mutableStateOf(false) }
    var notice by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val local = dialable(trip.profile.emergencyNumber)

    fun shareWith(kind: String) {
        busy = true
        scope.launch {
            val location = if (withLocation && hasLocation(context)) Locator.once(context) else null
            val event = vm.record(if (kind == "checkin") "checkin" else "help", location)
            if (Actions.shareToFamily(context, messageFor(trip, event, kind))) {
                vm.markShared(event.id)
                notice = "카카오톡에서 가족을 고르고 ‘전송’을 눌러야 전달돼요."
            }
            busy = false
        }
    }

    ScreenFrame(subtitle = subtitleFor(trip, vm.timelineNow()), title = "도움 · 연락", onBack = vm::home) {
        Notice("위급하면 먼저 현지 긴급전화를 거세요. 이 앱은 구조 요청을 대신하지 않아요.", Tone.Danger)
        BigButton(if (local != null) "📞 현지 긴급전화 ${trip.profile.emergencyNumber.trim()}" else "📞 현지 긴급전화 · 번호 없음", {
            if (local != null) Actions.dial(context, local) else notice = "현지 긴급번호가 아직 없어요. ‘설정’에서 여행 국가의 번호를 넣어 주세요. 영사콜센터는 바로 걸 수 있어요."
        }, kind = Kind.Danger, huge = true)
        BigButton("📞 영사콜센터 $CONSULAR", { Actions.dial(context, CONSULAR) }, kind = Kind.Secondary)
        Text("전화 앱에 번호만 채워져요. 통화 버튼을 눌러야 걸려요. 영사콜센터는 국제전화·로밍 요금이 나올 수 있어요.", style = Type.Small, color = Palette.Muted)
        LocationOptIn(withLocation, { withLocation = it }, "가족에게 보낼 때 지금 위치도 함께 (선택)") { notice = "위치 권한이 없어 위치 없이 보내요." }
        BigButton("가족에게 도움 요청 보내기 (카톡)", { shareWith("help") }, kind = Kind.Kakao, enabled = !busy)
        BigButton("가족에게 ‘잘 지내요’ 안부 보내기", { shareWith("checkin") }, kind = Kind.Secondary, enabled = !busy)
        if (notice.isNotEmpty()) Notice(notice)
        Text("마지막 안부 기록: ${timeText(trip.lastCheckinAt)}", style = Type.Small, color = Palette.Muted)
    }
}
