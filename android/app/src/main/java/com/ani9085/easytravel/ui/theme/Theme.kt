package com.ani9085.easytravel.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// 웹 globals.css와 같은 색. 부모님 화면 기준: 본문 20sp 이상, 주요 버튼 64dp 이상, 높은 대비.
object Palette {
    val Navy = Color(0xFF0F2D45)
    val Teal = Color(0xFF0B5563)
    val Mint = Color(0xFF75E3B2)
    val MintSoft = Color(0xFFDFF8ED)
    val MintInk = Color(0xFF16704C)
    val Blue = Color(0xFF0B5FD6)
    val Paper = Color(0xFFF8FAFC)
    val Card = Color(0xFFFFFFFF)
    val Line = Color(0xFFCBD5E1)
    val Ink = Color(0xFF1E293B)
    val Muted = Color(0xFF475569)
    val Amber = Color(0xFFFFF4CF)
    val AmberInk = Color(0xFF7A4D00)
    val Rose = Color(0xFFFFE5E5)
    val RoseInk = Color(0xFFB42318)
    val Kakao = Color(0xFFFEE500)
    val KakaoInk = Color(0xFF191600)
}

object Type {
    private fun style(size: Int, weight: FontWeight, line: Float = 1.4f) = TextStyle(fontSize = size.sp, fontWeight = weight, lineHeight = (size * line).sp)
    val Huge = style(38, FontWeight.Black, 1.2f)
    val Title = style(28, FontWeight.Black, 1.3f)
    val Section = style(22, FontWeight.Bold)
    val Button = style(22, FontWeight.Black, 1.25f)
    val Body = style(20, FontWeight.Normal, 1.5f)
    val BodyBold = style(20, FontWeight.Bold, 1.5f)
    val Small = style(16, FontWeight.Normal, 1.45f)
    val Label = style(17, FontWeight.Bold)
}

@Composable
fun EasyTravelTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Palette.Blue,
            onPrimary = Color.White,
            secondary = Palette.Teal,
            background = Palette.Paper,
            surface = Palette.Card,
            onSurface = Palette.Ink,
            onBackground = Palette.Ink,
            error = Palette.RoseInk
        ),
        content = content
    )
}
