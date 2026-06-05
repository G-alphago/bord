#!/bin/bash
APP_PATH="./dist/mac-arm64/2026 중고등부 학생수련회 방명록.app"
ENTITLEMENTS="build/entitlements.mac.plist"

echo "=== Starting manual deep ad-hoc codesign with JIT entitlements ==="

# 1. Sign dylibs inside Frameworks
find "$APP_PATH" -name "*.dylib" -o -name "*.so" | while read -r file; do
    echo "Signing: $file"
    codesign --force --sign - "$file"
done

# 2. Sign Helpers inside Electron Framework (chrome_crashpad_handler)
CRASHPAD_HANDLER="$APP_PATH/Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler"
if [ -f "$CRASHPAD_HANDLER" ]; then
    echo "Signing Crashpad Helper: $CRASHPAD_HANDLER"
    codesign --force --sign - "$CRASHPAD_HANDLER"
fi

# 3. Sign Squirrel, Mantle, ReactiveObjC Frameworks
find "$APP_PATH/Contents/Frameworks" -name "*.framework" -maxdepth 1 | while read -r fw; do
    fw_name=$(basename "$fw" .framework)
    fw_binary="$fw/Versions/A/$fw_name"
    if [ -f "$fw_binary" ] && [ "$fw_name" != "Electron Framework" ]; then
        echo "Signing Framework: $fw_binary"
        codesign --force --sign - "$fw_binary"
    fi
done

# 4. Sign Electron Framework itself
ELECTRON_FW="$APP_PATH/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
if [ -f "$ELECTRON_FW" ]; then
    echo "Signing Electron Framework: $ELECTRON_FW"
    codesign --force --sign - "$ELECTRON_FW"
fi

# 5. Sign Helper App binaries
find "$APP_PATH/Contents/Frameworks" -name "*Helper*.app" | while read -r helper_app; do
    helper_name=$(basename "$helper_app" .app)
    helper_binary="$helper_app/Contents/MacOS/$helper_name"
    if [ -f "$helper_binary" ]; then
        echo "Signing Helper with JIT: $helper_binary"
        codesign --force --sign - --entitlements "$ENTITLEMENTS" "$helper_binary"
    fi
done

# 6. Sign the main executable
MAIN_EXE="$APP_PATH/Contents/MacOS/2026 중고등부 학생수련회 방명록"
echo "Signing Main Executable with JIT: $MAIN_EXE"
codesign --force --sign - --entitlements "$ENTITLEMENTS" "$MAIN_EXE"

# 7. Sign the outer App bundle
echo "Signing Outer App Bundle: $APP_PATH"
codesign --force --sign - --entitlements "$ENTITLEMENTS" "$APP_PATH"

# 8. Remove quarantine attribute (Gatekeeper bypass)
echo "Removing quarantine attributes..."
xattr -cr "$APP_PATH"

# 9. Verify main app
echo "=== Verifying ==="
codesign -vd "$APP_PATH"
codesign -d --entitlements - "$APP_PATH"

echo "=== Done ==="
