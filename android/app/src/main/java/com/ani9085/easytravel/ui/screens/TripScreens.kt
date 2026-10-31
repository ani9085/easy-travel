package com.ani9085.easytravel.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.ani9085.easytravel.data.ItemStatus
import com.ani9085.easytravel.data.ItineraryItem
import com.ani9085.easytravel.data.Timeline
import com.ani9085.easytravel.data.Trip
import com.ani9085.easytravel.data.nextItem
import com.ani9085.easytravel.data.periodLabel
import com.ani9085.easytravel.data.stageLabel
import com.ani9085.easytravel.data.todayDay
import com.ani9085.easytravel.ui.AppViewModel
import com.ani9085.easytravel.ui.Screen
import com.ani9085.easytravel.ui.components.BigButton
import com.ani9085.easytravel.ui.components.Field
import com.ani9085.easytravel.ui.components.Kind
import com.ani9085.easytravel.ui.components.Notice
import com.ani9085.easytravel.ui.components.Panel
import com.ani9085.easytravel.ui.components.ScreenFrame
import com.ani9085.easytravel.ui.components.TextLink
import com.ani9085.easytravel.ui.components.Tile
import com.ani9085.easytravel.ui.components.Tone
import com.ani9085.easytravel.ui.theme.Palette
import com.ani9085.easytravel.ui.theme.Type
import com.ani9085.easytravel.util.Actions

fun subtitleFor(trip: Trip, timeline: Timeline) =
    if (trip.isEmpty) "부모님 여행 도우미" else "${trip.profile.destination.ifBlank { "여행지 미정" }} · ${stageLabel(timeline)}"

@Composable
fun SetupAction(vm: AppViewModel) {
    OutlinedButton(onClick = { vm.open(Screen.Setup) }, modifier = Modifier.heightIn(min = 48.dp)) {
        Text("설정", style = Type.Label, color = Color.White)
    }
}

@Composable
fun HomeScreen(vm: AppViewModel, trip: Trip) {
    val timeline = vm.timelineNow()
    ScreenFrame(subtitle = subtitleFor(trip, timeline), action = { SetupAction(vm) }) {
        if (trip.isEmpty) {
            Panel {
                Text("아직 여행이 없어요", style = Type.Title, color = Palette.Ink)
                Text("보호자가 카카오톡으로 보낸 ‘여행 보내기’ 링크를 누르면 여행이 바로 들어와요. 직접 만들 수도 있어요.", style = Type.Body, color = Palette.Muted)
            }
            BigButton("보호자가 보낸 링크로 가져오기", { vm.open(Screen.Import) }, huge = true)
            BigButton("직접 여행 만들기", { vm.open(Screen.Setup) }, kind = Kind.Secondary)
            return@ScreenFrame
        }
        val context = LocalContext.current
        val current = nextItem(trip.itinerary, timeline)
        val after = current?.let { now -> trip.itinerary.filter { it.id != now.id && it.status.isOpen && it.day >= now.day }.minByOrNull { it.day } }
        Column(
            Modifier.fillMaxWidth()
                .background(Brush.linearGradient(listOf(Palette.Navy, Palette.Teal, Color(0xFF1F7A62))), RoundedCornerShape(22.dp))
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (current == null) {
                Text("오늘 일정", style = Type.Label, color = Palette.Mint)
                Text("남은 일정이 없어요", style = Type.Title, color = Color.White)
                Text("숙소로 돌아가거나 쉬어 가세요.", style = Type.Body, color = Color(0xFFE3F2F2))
            } else {
                Text("${if (current.status == ItemStatus.ARRIVED) "지금 있는 곳" else "다음에 갈 곳"} · Day ${current.day}", style = Type.Label, color = Palette.Mint)
                Text(current.name, style = Type.Huge, color = Color.White)
                if (current.note.isNotBlank()) Text(current.note, style = Type.Body, color = Color(0xFFE3F2F2))
                if (current.status == ItemStatus.ARRIVED) {
                    BigButton("✓ 다 봤어요, 다음으로", { vm.mark(current, ItemStatus.COMPLETED, "${current.name}을(를) 다 봤다고 기록했어요.") }, kind = Kind.Light, huge = true)
                } else {
                    BigButton("↗ 길찾기", { Actions.directions(context, current.name + " " + trip.profile.destination) }, kind = Kind.Light, huge = true)
                    BigButton("도착했어요", { vm.mark(current, ItemStatus.ARRIVED, "${current.name}에 도착했다고 기록했어요.") }, kind = Kind.Light)
                }
                TextLink("오늘은 건너뛰기", { vm.mark(current, ItemStatus.SKIPPED, "${current.name}은(는) 오늘 건너뛰었어요.") }, color = Color.White)
                after?.let { Text("그다음: Day ${it.day} · ${it.name}", style = Type.Small, color = Color(0xFFD3E8E8)) }
            }
        }
        UndoNotice(vm)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Tile("🏨", "숙소로 가기", {
                if (trip.profile.hotel.isBlank()) vm.open(Screen.Arrival) else Actions.directions(context, trip.profile.hotel)
            })
            Tile("🛎️", "숙소 도착 알리기", { vm.open(Screen.Arrival) })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Tile("🗣️", "통역", { vm.open(Screen.Translate) })
            Tile("💱", "돈 계산", { vm.open(Screen.Money) })
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Tile("📷", "여기 어디?", { vm.open(Screen.Photo) })
            Tile("🆘", "도움 · 연락", { vm.open(Screen.Help) }, danger = true)
        }
        BigButton("일정 전체 보기", { vm.open(Screen.Plan) }, kind = Kind.Secondary)
        if (trip.profile.hotel.isBlank()) Notice("숙소가 아직 없어요. 위 ‘설정’에서 숙소 이름이나 주소를 넣어 주세요.", Tone.Info)
    }
}

@Composable
fun UndoNotice(vm: AppViewModel) {
    val undo = vm.undo ?: return
    Row(
        Modifier.fillMaxWidth().background(Palette.MintSoft, RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(undo.message, style = Type.Small, color = Palette.MintInk, modifier = Modifier.weight(1f))
        TextLink("되돌리기", vm::revert, color = Palette.MintInk)
    }
}

@Composable
fun PlanScreen(vm: AppViewModel, trip: Trip) {
    val context = LocalContext.current
    val timeline = vm.timelineNow()
    val today = todayDay(timeline, nextItem(trip.itinerary, timeline))
    ScreenFrame(subtitle = subtitleFor(trip, timeline), title = "여행 일정", onBack = vm::home) {
        Text(periodLabel(trip.profile), style = Type.Body, color = Palette.Muted)
        UndoNotice(vm)
        if (trip.itinerary.isEmpty()) Notice("일정이 아직 없어요. ‘설정’에서 장소를 넣거나 보호자가 보낸 링크로 가져와 주세요.", Tone.Info)
        trip.itinerary.groupBy { it.day }.toSortedMap().forEach { (day, items) ->
            Text(if (day == today) "Day $day · 오늘" else "Day $day", style = Type.Section, color = if (day == today) Palette.Blue else Palette.Ink)
            items.forEach { item -> PlanItem(vm, item) { Actions.directions(context, item.name + " " + trip.profile.destination) } }
        }
    }
}

@Composable
private fun PlanItem(vm: AppViewModel, item: ItineraryItem, onDirections: () -> Unit) {
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(item.name, style = Type.BodyBold, color = Palette.Ink, modifier = Modifier.weight(1f))
            Text(item.status.label, style = Type.Label, color = if (item.status.isOpen) Palette.Blue else Palette.Muted)
        }
        if (item.note.isNotBlank()) Text(item.note, style = Type.Small, color = Palette.Muted)
        BigButton("↗ 길찾기", onDirections, kind = Kind.Secondary)
        if (item.status.isOpen) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (item.status != ItemStatus.ARRIVED) {
                    BigButton("도착", { vm.mark(item, ItemStatus.ARRIVED, "${item.name}에 도착했다고 기록했어요.") }, Modifier.weight(1f), kind = Kind.Secondary)
                }
                BigButton("다 봤어요", { vm.mark(item, ItemStatus.COMPLETED, "${item.name}을(를) 다 봤다고 기록했어요.") }, Modifier.weight(1f), kind = Kind.Secondary)
            }
        }
    }
}

@Composable
fun ImportScreen(vm: AppViewModel, trip: Trip) {
    val clipboard = LocalClipboardManager.current
    var link by rememberSaveable { mutableStateOf("") }
    ScreenFrame(subtitle = subtitleFor(trip, vm.timelineNow()), title = "여행 가져오기", onBack = { vm.cancelImport(); vm.home() }) {
        val pending = vm.pendingImport
        if (pending != null) {
            Panel {
                Text(pending.profile.destination, style = Type.Title, color = Palette.Ink)
                Text("📅 ${periodLabel(pending.profile)} · 👨‍👩‍👧 ${pending.profile.travelers}명", style = Type.Body, color = Palette.Ink)
                Text("🏨 ${pending.profile.hotel.ifBlank { "숙소 미정" }}", style = Type.Body, color = Palette.Ink)
                Text("일정 ${pending.itinerary.size}곳", style = Type.Body, color = Palette.Ink)
                pending.itinerary.take(6).forEach { Text("· Day ${it.day} ${it.name}", style = Type.Small, color = Palette.Muted) }
            }
            if (!trip.isEmpty) Notice("지금 휴대폰에 있는 여행이 이 여행으로 바뀌어요. 안부·도착 기록은 그대로 남아요.", Tone.Warning)
            BigButton("이 여행으로 시작하기", vm::confirmImport, huge = true)
            BigButton("취소", { vm.cancelImport(); vm.home() }, kind = Kind.Secondary)
            return@ScreenFrame
        }
        Text("보호자가 카카오톡으로 보낸 ‘부모님 앱으로 보내기’ 링크를 누르면 자동으로 열려요. 안 열리면 링크를 길게 눌러 복사한 뒤 아래에 붙여넣어 주세요.", style = Type.Body, color = Palette.Ink)
        BigButton("복사한 링크 붙여넣기", { clipboard.getText()?.text?.let { link = it } }, kind = Kind.Secondary)
        Field("받은 링크", link, { link = it }, placeholder = "https://…/send#…", singleLine = false, minLines = 2)
        vm.importError?.let { Notice(it, Tone.Danger) }
        BigButton("가져오기", { vm.offerImport(link) }, enabled = link.isNotBlank(), huge = true)
    }
}
