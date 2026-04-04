#!/bin/bash

# -------------------------------
# CONFIGURATION
# -------------------------------

# Change these to your app's details
APP_NAME="Words"
APP_ID="com.softwyx.words"
ANDROID_DIR="android"
KEYSTORE_DIR="$ANDROID_DIR/keystore"
KEYSTORE_NAME="release.keystore"
KEY_ALIAS="wordskey"
KEYSTORE_PASSWORD="changeit"   # Change to a strong password
KEY_PASSWORD="changeit"        # Can be same as keystore password

# -------------------------------
# HELPER FUNCTIONS
# -------------------------------

function check_dependencies() {
    command -v npm >/dev/null 2>&1 || { echo "npm not found. Install nodejs first."; exit 1; }
    command -v npx >/dev/null 2>&1 || { echo "npx not found. Install nodejs first."; exit 1; }
    command -v ./gradlew >/dev/null 2>&1 || { echo "Gradle wrapper not found. Make sure $ANDROID_DIR exists."; exit 1; }
}

function create_keystore() {
    mkdir -p "$KEYSTORE_DIR"
    if [ ! -f "$KEYSTORE_DIR/$KEYSTORE_NAME" ]; then
        echo "Creating keystore for release build..."
        keytool -genkey -v \
            -keystore "$KEYSTORE_DIR/$KEYSTORE_NAME" \
            -alias "$KEY_ALIAS" \
            -keyalg RSA -keysize 2048 \
            -validity 10000 \
            -storepass "$KEYSTORE_PASSWORD" \
            -keypass "$KEY_PASSWORD" \
            -dname "CN=$APP_NAME, OU=Softwyx, O=Softwyx, L=City, S=State, C=TN"
        echo "Keystore created at $KEYSTORE_DIR/$KEYSTORE_NAME"
    fi
}

# -------------------------------
# PARSE ARGUMENT
# -------------------------------
BUILD_TYPE=$1
if [ "$BUILD_TYPE" != "debug" ] && [ "$BUILD_TYPE" != "release" ]; then
    echo "Usage: ./build.sh [debug|release]"
    exit 1
fi

# -------------------------------
# 1. Build Vite project
# -------------------------------
echo "Building Vite project..."
npm run build || { echo "Vite build failed"; exit 1; }

# -------------------------------
# 2. Sync Capacitor
# -------------------------------
echo "Syncing Capacitor..."
npx cap sync || { echo "Capacitor sync failed"; exit 1; }

# -------------------------------
# 3. Build APK
# -------------------------------
cd "$ANDROID_DIR" || exit 1

if [ "$BUILD_TYPE" == "debug" ]; then
    echo "Building DEBUG APK..."
    ./gradlew assembleDebug --no-daemon || { echo "Debug build failed"; exit 1; }
    echo "Debug APK built at $ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
else
    echo "Building RELEASE APK..."
    create_keystore
    # Create signing config for Gradle if not exists
    if ! grep -q "release" app/build.gradle; then
        echo "Adding signing config to app/build.gradle..."
        sed -i "/android {/a \\
    signingConfigs {\\
        release {\\
            storeFile file('$KEYSTORE_DIR/$KEYSTORE_NAME')\\
            storePassword '$KEYSTORE_PASSWORD'\\
            keyAlias '$KEY_ALIAS'\\
            keyPassword '$KEY_PASSWORD'\\
        }\\
    }\\
    buildTypes {\\
        release {\\
            signingConfig signingConfigs.release\\
            minifyEnabled false\\
        }\\
    }" app/build.gradle
    fi

    ./gradlew assembleRelease --no-daemon || { echo "Release build failed"; exit 1; }
    echo "Release APK built at $ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
fi