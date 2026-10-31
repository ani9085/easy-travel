package com.ani9085.easytravel.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ani9085.easytravel.ui.theme.Palette
import com.ani9085.easytravel.ui.theme.Type

/** 상단 남색 막대 + (있으면) "처음으로" 버튼 + 스크롤되는 본문. */
@Composable
fun ScreenFrame(
    subtitle: String,
    title: String? = null,
    onBack: (() -> Unit)? = null,
    action: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(Modifier.fillMaxSize().background(Palette.Paper)) {
        Row(
            Modifier.fillMaxWidth().background(Palette.Navy).statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text("이지트래블", color = Color.White, style = Type.Section)
                Text(subtitle, color = Color(0xFFD3E2EA), style = Type.Small)
            }
            action?.invoke()
        }
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            if (onBack != null) {
                OutlinedButton(
                    onClick = onBack,
                    modifier = Modifier.heightIn(min = 56.dp),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(2.dp, Palette.Line)
                ) { Text("← 처음으로", style = Type.Button, color = Palette.Ink) }
            }
            if (title != null) Text(title, style = Type.Title, color = Palette.Ink)
            content()
            Spacer(Modifier.size(24.dp))
        }
    }
}

enum class Kind { Primary, Light, Secondary, Danger, Kakao, Green }

@Composable
fun BigButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, kind: Kind = Kind.Primary, enabled: Boolean = true, huge: Boolean = false) {
    val (bg, fg) = when (kind) {
        Kind.Primary -> Palette.Blue to Color.White
        Kind.Light -> Color.White to Palette.Navy
        Kind.Secondary -> Color(0xFFEEF4F8) to Palette.Ink
        Kind.Danger -> Palette.RoseInk to Color.White
        Kind.Kakao -> Palette.Kakao to Palette.KakaoInk
        Kind.Green -> Palette.MintInk to Color.White
    }
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().heightIn(min = if (huge) 72.dp else 60.dp),
        shape = RoundedCornerShape(18.dp),
        colors = ButtonDefaults.buttonColors(containerColor = bg, contentColor = fg, disabledContainerColor = bg.copy(alpha = 0.5f), disabledContentColor = fg.copy(alpha = 0.6f)),
        border = if (kind == Kind.Secondary) BorderStroke(1.dp, Palette.Line) else null
    ) {
        Text(text, style = if (huge) Type.Button.copy(fontSize = 24.sp) else Type.Button, textAlign = TextAlign.Center)
    }
}

@Composable
fun TextLink(text: String, onClick: () -> Unit, color: Color = Palette.Blue) {
    Text(
        text,
        style = Type.BodyBold.copy(textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline),
        color = color,
        modifier = Modifier.heightIn(min = 48.dp).clickable(role = Role.Button, onClick = onClick).padding(vertical = 10.dp)
    )
}

@Composable
fun RowScope.Tile(emoji: String, label: String, onClick: () -> Unit, danger: Boolean = false) {
    Column(
        Modifier.weight(1f).heightIn(min = 128.dp)
            .background(if (danger) Color(0xFFFFF5F4) else Color.White, RoundedCornerShape(18.dp))
            .border(2.dp, if (danger) Color(0xFFE9A9A3) else Palette.Line, RoundedCornerShape(18.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(emoji, fontSize = 36.sp)
        Text(label, style = Type.BodyBold, color = Palette.Ink, textAlign = TextAlign.Center)
    }
}

enum class Tone { Info, Success, Warning, Danger }

@Composable
fun Notice(text: String, tone: Tone = Tone.Warning, modifier: Modifier = Modifier) {
    val (bg, fg) = when (tone) {
        Tone.Info -> Color(0xFFE8F1FF) to Palette.Ink
        Tone.Success -> Palette.MintSoft to Palette.MintInk
        Tone.Warning -> Palette.Amber to Palette.AmberInk
        Tone.Danger -> Palette.Rose to Palette.RoseInk
    }
    Text(text, style = Type.Small.copy(fontSize = 17.sp), color = fg, modifier = modifier.fillMaxWidth().background(bg, RoundedCornerShape(14.dp)).padding(14.dp))
}

@Composable
fun Panel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(18.dp)).border(1.dp, Palette.Line, RoundedCornerShape(18.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        content = content
    )
}

@Composable
fun Field(label: String, value: String, onChange: (String) -> Unit, placeholder: String = "", keyboard: KeyboardType = KeyboardType.Text, singleLine: Boolean = true, minLines: Int = 1) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = Type.Label, color = Palette.Ink)
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            modifier = Modifier.fillMaxWidth(),
            textStyle = Type.Body,
            placeholder = { if (placeholder.isNotEmpty()) Text(placeholder, style = Type.Body, color = Palette.Muted) },
            singleLine = singleLine,
            minLines = minLines,
            keyboardOptions = KeyboardOptions(keyboardType = keyboard)
        )
    }
}

@Composable
fun Chip(text: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.heightIn(min = 48.dp)
            .background(if (selected) Palette.Navy else Color.White, RoundedCornerShape(24.dp))
            .border(1.dp, if (selected) Palette.Navy else Palette.Line, RoundedCornerShape(24.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) { Text(text, style = Type.Label, color = if (selected) Color.White else Palette.Ink) }
}
