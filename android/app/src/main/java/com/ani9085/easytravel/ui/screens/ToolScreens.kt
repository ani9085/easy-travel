package com.ani9085.easytravel.ui.screens

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.speech.RecognizerIntent
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import com.ani9085.easytravel.data.Trip
import com.ani9085.easytravel.data.parsePlaceCandidates
import com.ani9085.easytravel.net.Api
import com.ani9085.easytravel.net.ApiResult
import com.ani9085.easytravel.net.Rates
import com.ani9085.easytravel.ui.AppViewModel
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
import com.ani9085.easytravel.util.Images
import kotlinx.coroutines.launch
import java.io.File
import java.text.NumberFormat
import java.util.Locale

private data class Translation(val source: String, val text: String, val speechLang: String, val toKorean: Boolean)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TranslateScreen(vm: AppViewModel, trip: Trip) {
    val scope = rememberCoroutineScope()
    val destination = trip.profile.destination
    val profile = vm.profile()
    var languageCode by rememberSaveable { mutableStateOf(vm.destinations.suggestedLanguage(destination).code) }
    val language = vm.destinations.languages.firstOrNull { it.code == languageCode } ?: vm.destinations.languages.first()
    var toKorean by rememberSaveable { mutableStateOf(false) }
    var text by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<Translation?>(null) }
    var notice by remember { mutableStateOf("") }
    var enlarged by remember { mutableStateOf(false) }

    // 말로 넣기: 휴대폰의 음성 인식 화면을 띄운다(구글 음성 입력). 결과 글은 고칠 수 있다.
    val listen = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        res.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.let { text = it }
    }

    fun startListening() {
        val tag = if (toKorean) language.speechLang else "ko-KR"
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, tag)
            .putExtra(RecognizerIntent.EXTRA_PROMPT, if (toKorean) "상대방이 ${language.name}로 말해 주세요" else "한국어로 말해 주세요")
        try {
            listen.launch(intent)
        } catch (_: ActivityNotFoundException) {
            notice = "이 휴대폰에서는 음성 입력을 쓸 수 없어요. 글자로 적어 주세요."
        }
    }

    fun translate() {
        val value = text.trim()
        if (value.isEmpty()) return
        busy = true
        notice = ""
        result = null
        scope.launch {
            when (val r = Api.translate(value, destination, toKorean, language.code)) {
                is ApiResult.Ok -> result = Translation(value, r.text, if (toKorean) "ko-KR" else language.speechLang, toKorean)
                is ApiResult.Fail -> notice = r.message
            }
            busy = false
        }
    }

    ScreenFrame(subtitle = subtitleFor(trip, vm.timelineNow()), title = "통역", onBack = vm::home) {
        Text("상대방 언어", style = Type.Label, color = Palette.Ink)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            vm.destinations.languages.forEach { option -> Chip(option.name, option.code == language.code) { languageCode = option.code; result = null } }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            BigButton("내가 말할 때\n한국어 → ${language.name}", { toKorean = false; text = ""; result = null }, Modifier.weight(1f), kind = if (!toKorean) Kind.Primary else Kind.Secondary)
            BigButton("상대방 말을 볼 때\n${language.name} → 한국어", { toKorean = true; text = ""; result = null }, Modifier.weight(1f), kind = if (toKorean) Kind.Primary else Kind.Secondary)
        }
        BigButton("🎤 말로 넣기", ::startListening, kind = Kind.Secondary)
        Field(if (toKorean) "${language.name}로 적어 주세요" else "한국어로 적어 주세요", text, { text = it }, placeholder = if (toKorean) "상대방에게 적어 달라고 해도 돼요" else "예: 이 근처에 약국이 있나요?", singleLine = false, minLines = 3)
        BigButton(if (busy) "번역 중…" else "${if (toKorean) "한국어" else language.name}로 바꾸기", ::translate, enabled = !busy && text.isNotBlank(), huge = true)
        if (notice.isNotEmpty()) Notice(notice)
        result?.let { r ->
            Panel {
                Text(if (r.toKorean) "한국어 뜻 · AI 번역은 틀릴 수 있어요" else "${language.name}로 보여 주세요 · AI 번역은 틀릴 수 있어요", style = Type.Small, color = Palette.Muted)
                Text(r.text, style = Type.Title.copy(fontSize = 30.sp), color = Palette.Ink)
                Text("원문: ${r.source}", style = Type.Small, color = Palette.Muted)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BigButton("크게 보여주기", { enlarged = true }, Modifier.weight(1f), kind = Kind.Secondary)
                    BigButton("🔊 읽어주기", {
                        if (!vm.speaker.speak(r.text, r.speechLang)) notice = "이 휴대폰에 해당 언어 음성이 없어요. 화면을 크게 보여 주세요."
                    }, Modifier.weight(1f), kind = Kind.Secondary)
                }
            }
        }
        if (!toKorean && profile.speechLang == language.speechLang && profile.phrases.isNotEmpty()) {
            Text("자주 쓰는 말 · ${language.name}", style = Type.Section, color = Palette.Ink)
            profile.phrases.forEach { phrase ->
                BigButton(phrase.ko, { text = phrase.ko; notice = ""; result = Translation(phrase.ko, phrase.local, language.speechLang, false) }, kind = Kind.Secondary)
            }
        }
    }

    val shown = result
    if (enlarged && shown != null) {
        Dialog(onDismissRequest = { enlarged = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Column(
                Modifier.fillMaxSize().background(Palette.Navy).verticalScroll(rememberScrollState()).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(28.dp, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(shown.text, color = androidx.compose.ui.graphics.Color.White, fontSize = 44.sp, lineHeight = 56.sp, textAlign = TextAlign.Center)
                BigButton("닫기", { enlarged = false }, kind = Kind.Light)
            }
        }
    }
}

private val CURRENCIES = listOf("JPY" to "엔", "EUR" to "유로", "USD" to "달러", "THB" to "바트", "VND" to "동")
private val DEMO_RATES = mapOf("JPY" to 9.3, "EUR" to 1550.0, "USD" to 1400.0, "THB" to 42.0, "VND" to 0.055)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MoneyScreen(vm: AppViewModel, trip: Trip) {
    val scope = rememberCoroutineScope()
    var code by rememberSaveable { mutableStateOf(vm.profile().currency?.takeIf { c -> CURRENCIES.any { it.first == c } } ?: "JPY") }
    var amount by rememberSaveable { mutableStateOf("1000") }
    var rate by rememberSaveable { mutableStateOf("") }
    var source by remember { mutableStateOf("") }
    var notice by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(code) {
        val saved = vm.prefs.rate(code)
        if (saved != null) {
            rate = "%.4f".format(Locale.US, saved.first).trimEnd('0').trimEnd('.')
            source = "ECB 기준환율 · 기준일 ${saved.second} · 마지막으로 받은 값"
        } else {
            rate = DEMO_RATES[code].toString()
            source = "앱에 넣어 둔 예시 값 · 실제 환율이 아니에요"
        }
        notice = ""
    }

    val won = (amount.replace(",", "").toDoubleOrNull() ?: 0.0) * (rate.toDoubleOrNull() ?: 0.0)
    ScreenFrame(subtitle = subtitleFor(trip, vm.timelineNow()), title = "돈 계산", onBack = vm::home) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            CURRENCIES.forEach { (c, label) -> Chip("$c $label", c == code) { code = c } }
        }
        Field("현지 금액 ($code)", amount, { amount = it }, keyboard = KeyboardType.Decimal)
        Panel {
            Text("원화로 약", style = Type.Small, color = Palette.Muted)
            Text("₩ " + NumberFormat.getIntegerInstance(Locale.KOREA).format(Math.round(won)), style = Type.Huge, color = Palette.Ink)
            Text("출처: $source", style = Type.Small, color = Palette.Muted)
        }
        Field("1 $code = 원", rate, { rate = it; source = "직접 입력한 환율" }, keyboard = KeyboardType.Decimal)
        BigButton(if (busy) "불러오는 중…" else "기준 환율 불러오기 (ECB)", {
            if (code == "VND") {
                notice = "동(VND)은 ECB 기준환율에 없어요. 환전소나 카드 앱에서 본 환율을 직접 넣어 주세요."
            } else {
                busy = true
                scope.launch {
                    val fetched = Rates.fetch(code)
                    if (fetched != null) {
                        vm.prefs.saveRate(code, fetched.krw, fetched.refDate)
                        rate = "%.4f".format(Locale.US, fetched.krw).trimEnd('0').trimEnd('.')
                        source = "ECB 기준환율 · 기준일 ${fetched.refDate}"
                    } else {
                        notice = "환율을 불러오지 못했어요. 지금 보이는 값으로 계산해요."
                    }
                    busy = false
                }
            }
        }, kind = Kind.Secondary, enabled = !busy)
        if (notice.isNotEmpty()) Notice(notice)
        Notice("참고용 계산이에요. 실제 환전소·카드 결제 환율과 수수료는 다를 수 있어요.", Tone.Info)
    }
}

@Composable
fun PhotoScreen(vm: AppViewModel, trip: Trip) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var dataUrl by remember { mutableStateOf<String?>(null) }
    var preview by remember { mutableStateOf<ImageBitmap?>(null) }
    var result by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var added by remember { mutableStateOf("") }
    var manual by rememberSaveable { mutableStateOf("") }
    val destination = trip.profile.destination

    val shotFile = remember { File(context.cacheDir, "photos/shot.jpg").apply { parentFile?.mkdirs() } }
    val shotUri: Uri = remember { FileProvider.getUriForFile(context, context.packageName + ".files", shotFile) }

    fun load(uri: Uri) {
        error = ""
        result = ""
        added = ""
        scope.launch {
            val url = Images.toJpegDataUrl(context, uri)
            if (url == null) {
                error = "이 사진은 열 수 없어요. 다른 사진을 고르거나 아래에 직접 적어 주세요."
            } else {
                dataUrl = url
                val bytes = Base64.decode(url.substringAfter(","), Base64.DEFAULT)
                preview = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
            }
            shotFile.delete()
        }
    }

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri -> uri?.let(::load) }
    val take = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) load(shotUri) }

    ScreenFrame(subtitle = subtitleFor(trip, vm.timelineNow()), title = "여기 어디?", onBack = vm::home) {
        Text("간판이나 건물 사진을 찍으면 AI가 장소 후보를 알려 드려요.", style = Type.Body, color = Palette.Ink)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            BigButton("📷 사진 찍기", { take.launch(shotUri) }, Modifier.weight(1f))
            BigButton("🖼️ 사진 고르기", { pick.launch("image/*") }, Modifier.weight(1f), kind = Kind.Secondary)
        }
        preview?.let { Image(it, contentDescription = "고른 사진", modifier = Modifier.fillMaxWidth().heightIn(max = 260.dp)) }
        if (dataUrl != null && result.isEmpty()) {
            Notice("‘AI로 살펴보기’를 누르면 이 사진이 easy-travel 서버를 거쳐 외부 AI(OpenRouter)로 전송돼요. 사진은 줄이고 촬영 위치 정보(EXIF)를 지운 뒤 보내며 저장하지 않아요. 얼굴이나 개인정보가 보이면 보내지 마세요.", Tone.Info)
            BigButton(if (busy) "살펴보는 중…" else "AI로 살펴보기", {
                val url = dataUrl ?: return@BigButton
                busy = true
                scope.launch {
                    when (val r = Api.photoLocation(url, destination)) {
                        is ApiResult.Ok -> result = r.text
                        is ApiResult.Fail -> error = r.message + " 아래에 간판 글자를 직접 적어 주세요."
                    }
                    busy = false
                }
            }, enabled = !busy, huge = true)
        }
        if (error.isNotEmpty()) Notice(error)
        if (result.isNotEmpty()) {
            Panel {
                Text("AI 추정 · 사진만으로는 틀릴 수 있어요", style = Type.Small, color = Palette.Muted)
                Text(result, style = Type.Body, color = Palette.Ink)
            }
            parsePlaceCandidates(result).forEach { name ->
                Panel {
                    Text(name, style = Type.BodyBold, color = Palette.Ink)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        BigButton("지도", { Actions.search(context, "$name $destination") }, Modifier.weight(1f), kind = Kind.Secondary)
                        BigButton("길찾기", { Actions.directions(context, "$name $destination") }, Modifier.weight(1f), kind = Kind.Secondary)
                        BigButton("일정에", {
                            vm.addItem(com.ani9085.easytravel.data.todayDay(vm.timelineNow(), null), name, "사진으로 찾은 장소 · 확인 필요")
                            added = "$name 을(를) 오늘 일정에 넣었어요."
                        }, Modifier.weight(1f), kind = Kind.Secondary)
                    }
                }
            }
            if (added.isNotEmpty()) Notice(added, Tone.Success)
        }
        Field("직접 적기 · 간판 글자나 장소 이름", manual, { manual = it }, placeholder = "예: 가게 간판 글자")
        BigButton("지도에서 찾기", { Actions.search(context, manual) }, kind = Kind.Secondary, enabled = manual.isNotBlank())
    }
}
