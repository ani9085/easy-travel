import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun loadProperties(name: String) = Properties().apply {
    val file = rootProject.file(name)
    if (file.exists()) file.inputStream().use(::load)
}

val localProperties = loadProperties("local.properties")
val keystoreProperties = loadProperties("keystore.properties")

fun setting(key: String, fallback: String = "") =
    (localProperties.getProperty(key) ?: providers.gradleProperty(key).orNull ?: fallback).trim()

// AI·항공 조회 서버(Vercel). OpenRouter·Duffel 키는 서버에만 있고 앱에는 넣지 않는다.
val apiBaseUrl = setting("API_BASE_URL", "https://easy-travel-dosl.vercel.app").trimEnd('/')
// 서버가 EASY_TRAVEL_ACCESS_CODE를 요구할 때 보낼 가족 접속 코드. local.properties에만 두고 커밋하지 않는다.
val familyAccessCode = setting("FAMILY_ACCESS_CODE")

fun quoted(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "com.ani9085.easytravel"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.ani9085.easytravel"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "0.2.0"

        buildConfigField("String", "API_BASE_URL", quoted(apiBaseUrl))
        buildConfigField("String", "FAMILY_ACCESS_CODE", quoted(familyAccessCode))
    }

    signingConfigs {
        if (keystoreProperties.getProperty("storeFile") != null) {
            create("upload") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfigs.findByName("upload")?.let { signingConfig = it }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.2")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.work:work-runtime-ktx:2.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    debugImplementation("androidx.compose.ui:ui-tooling")

    testImplementation("junit:junit:4.13.2")
    // 안드로이드의 org.json은 JVM 단위 테스트에서 동작하지 않는 껍데기라 실제 구현을 넣는다.
    testImplementation("org.json:json:20240303")
}
