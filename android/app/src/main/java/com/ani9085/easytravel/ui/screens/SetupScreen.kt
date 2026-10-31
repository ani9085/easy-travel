package com.ani9085.easytravel.ui.screens

import android.Manifest
import android.app.DatePickerDialog
import android.content.Context
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.ani9085.easytravel.BuildConfig
import com.ani9085.easytravel.data.DateCheck
import com.ani9085.easytravel.data.MAX_TRAVELERS
import com.ani9085.easytravel.data.Trip
import com.ani9085.easytravel.data.checkDates
import com.ani9085.easytravel.data.dialable
import com.ani9085.easytravel.ui.AppViewModel
import com.ani9085.easytravel.ui.Screen
import com.ani9085.easytravel.ui.components.BigButton
import com.ani9085.easytravel.ui.components.Chip
import com.ani9085.easytravel.ui.components.Field
import com.ani9085.easytravel.ui.components.Kind
import com.ani9085.easytravel.ui.components.Notice
import com.ani9085.easytravel.ui.components.Panel
import com.ani9085.easytravel.ui.components.ScreenFrame
import com.ani9085.easytravel.ui.components.Tone
import com.ani9085.easytravel.ui.theme.Palette
import com.ani9085.easytravel.ui.theme.Type
import com.ani9085.easytravel.util.Actions
import java.time.LocalDate

private val QUICK_DESTINATIONS = listOf("도쿄, 일본", "오사카, 일본", "후쿠오카, 일본", "파리, 프랑스", "방콕, 태국", "다낭, 베트남")

private fun pickDate(context: Context, current: String, onPicked: (String) -> Unit) {
    val base = runCatching { LocalDate.parse(current) }.getOrElse { LocalDate.now() }
    DatePickerDialog(context, { _, year, month, day -> onPicked(LocalDate.of(year, month + 1, day).toString()) }, base.year, base.monthValue - 1, base.dayOfMonth).show()
}

/** 보호자가 부모님 휴대폰에서 미리 넣어 두는 설정. 바꾸는 즉시 이 휴대폰에 저장된다. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SetupScreen(vm: AppViewModel, trip: Trip) {
    val context = LocalContext.current
    val profile = trip.profile
    val watch = trip.priceWatch
    var newPlace by rememberSaveable { mutableStateOf("") }
    var newDay by rememberSaveable { mutableStateOf(1) }
    var target by rememberSaveable { mutableStateOf(watch.targetPrice?.toString() ?: "") }
    var confirmClear by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf("") }
    val check = checkDates(profile)
    val maxDay = ((check as? DateCheck.Ok)?.days ?: 10).coerceAtLeast(trip.itinerary.maxOfOrNull { it.day } ?: 1)

    val askNotify = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) notice = "알림 권한이 없어 가격 감시 결과는 이 화면에서만 볼 수 있어요."
    }

    ScreenFrame(subtitle = "보호자용 설정", title = "여행 설정", onBack = vm::home) {
        Notice("보호자가 미리 넣어 두면 부모님은 누르기만 하면 돼요. 보호자 웹에서 만든 여행은 ‘링크로 가져오기’가 더 편해요.", Tone.Info)
        BigButton("보호자가 보낸 링크로 가져오기", { vm.open(Screen.Import) }, kind = Kind.Secondary)

        Text("여행지", style = Type.Section, color = Palette.Ink)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            QUICK_DESTINATIONS.forEach { name -> Chip(name, profile.destination == name) { vm.updateProfile { it.copy(destination = name) } } }
        }
        Field("여행지 직접 입력", profile.destination, { value -> vm.updateProfile { it.copy(destination = value.take(120)) } }, placeholder = "예: 도쿄, 일본")

        Text("날짜", style = Type.Section, color = Palette.Ink)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            BigButton("출발 ${profile.startDate.ifBlank { "고르기" }}", { pickDate(context, profile.startDate) { d -> vm.updateProfile { it.copy(startDate = d) } } }, Modifier.weight(1f), kind = Kind.Secondary)
            BigButton("귀국 ${profile.endDate.ifBlank { "고르기" }}", { pickDate(context, profile.endDate.ifBlank { profile.startDate }) { d -> vm.updateProfile { it.copy(endDate = d) } } }, Modifier.weight(1f), kind = Kind.Secondary)
        }
        if (check is DateCheck.Error) Notice(check.message, Tone.Danger)

        Text("인원", style = Type.Section, color = Palette.Ink)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            BigButton("−", { vm.updateProfile { it.copy(travelers = (it.travelers - 1).coerceAtLeast(1)) } }, Modifier.weight(1f), kind = Kind.Secondary)
            Text("${profile.travelers}명", style = Type.Title, color = Palette.Ink)
            BigButton("+", { vm.updateProfile { it.copy(travelers = (it.travelers + 1).coerceAtMost(MAX_TRAVELERS)) } }, Modifier.weight(1f), kind = Kind.Secondary)
        }

        Field("숙소 이름이나 주소", profile.hotel, { value -> vm.updateProfile { it.copy(hotel = value.take(160)) } }, placeholder = "예: 신주쿠역 근처 ○○호텔")
        Field("현지 긴급번호", profile.emergencyNumber, { value -> vm.updateProfile { it.copy(emergencyNumber = value.take(20)) } }, placeholder = "여행 국가 번호를 확인해 넣어 주세요", keyboard = KeyboardType.Phone)
        if (profile.emergencyNumber.isNotBlank() && dialable(profile.emergencyNumber) == null) Notice("숫자로만 넣어 주세요 (예: 110, 112).", Tone.Danger)
        Text("앱이 나라별 긴급번호를 대신 정하지 않아요. 출발 전에 확인해 넣어 주세요.", style = Type.Small, color = Palette.Muted)
        Field("가족에게 보낼 때 호칭", profile.travelerName, { value -> vm.updateProfile { it.copy(travelerName = value.take(20)) } }, placeholder = "예: 엄마 (비우면 ‘부모님’)")

        Text("일정", style = Type.Section, color = Palette.Ink)
        trip.itinerary.sortedBy { it.day }.forEach { item ->
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Day ${item.day} · ${item.name}", style = Type.BodyBold, color = Palette.Ink, modifier = Modifier.weight(1f))
                    TextButton(onClick = { vm.removeItem(item.id) }) { Text("삭제", style = Type.Label, color = Palette.RoseInk) }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            BigButton("−", { newDay = (newDay - 1).coerceAtLeast(1) }, Modifier.weight(1f), kind = Kind.Secondary)
            Text("Day $newDay", style = Type.Section, color = Palette.Ink)
            BigButton("+", { newDay = (newDay + 1).coerceAtMost(maxDay) }, Modifier.weight(1f), kind = Kind.Secondary)
        }
        Field("장소 이름", newPlace, { newPlace = it }, placeholder = "예: 센소지")
        BigButton("일정에 넣기", { vm.addItem(newDay, newPlace); newPlace = "" }, enabled = newPlace.isNotBlank())

        Text("항공 가격 감시", style = Type.Section, color = Palette.Ink)
        Text("하루 두 번쯤 서버에 최저가를 물어 목표 금액 이하이면 알림을 띄워요. 정확한 시각은 보장하지 않고, 가격은 조회 시점의 결과예요.", style = Type.Small, color = Palette.Muted)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            androidx.compose.foundation.layout.Box(Modifier.weight(1f)) { Field("출발 공항", profile.originIata, { v -> vm.updateProfile { it.copy(originIata = v.uppercase().filter(Char::isLetter).take(3)) } }, placeholder = "ICN") }
            androidx.compose.foundation.layout.Box(Modifier.weight(1f)) { Field("도착 공항", profile.destinationIata, { v -> vm.updateProfile { it.copy(destinationIata = v.uppercase().filter(Char::isLetter).take(3)) } }, placeholder = "NRT") }
        }
        Field("목표 금액 (${profile.travelers}명 왕복 총액, 원)", target, { target = it.filter(Char::isDigit).take(10) }, placeholder = "예: 900000", keyboard = KeyboardType.Number)
        if (watch.enabled) {
            BigButton("가격 감시 끄기", { vm.setPriceWatch(false, target.toLongOrNull()) }, kind = Kind.Secondary)
        } else {
            BigButton("가격 감시 켜기", {
                if (Build.VERSION.SDK_INT >= 33) askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
                vm.setPriceWatch(true, target.toLongOrNull())
            }, kind = Kind.Green, enabled = profile.originIata.length == 3 && profile.destinationIata.length == 3 && check is DateCheck.Ok && !check.assumed)
        }
        watch.lastStatus?.let { Notice("마지막 확인 ${timeText(watch.lastCheckedAt)} · $it", Tone.Info) }
        if (notice.isNotEmpty()) Notice(notice)

        Text("그 밖에", style = Type.Section, color = Palette.Ink)
        BigButton("보호자 웹 열기 (계획·비교)", { Actions.openUrl(context, BuildConfig.API_BASE_URL + "/guardian") }, kind = Kind.Secondary)
        BigButton("이 여행 지우기", { confirmClear = true }, kind = Kind.Secondary)
        Text("앱 버전 ${BuildConfig.VERSION_NAME}", style = Type.Small, color = Palette.Muted)
    }

    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("여행을 지울까요?", style = Type.Section) },
            text = { Text("이 휴대폰에 저장된 일정·기록이 지워져요. 되돌릴 수 없어요.", style = Type.Body) },
            confirmButton = { TextButton(onClick = { vm.clearTrip(); confirmClear = false; vm.home() }) { Text("지우기", style = Type.Label, color = Palette.RoseInk) } },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("취소", style = Type.Label) } }
        )
    }
}
