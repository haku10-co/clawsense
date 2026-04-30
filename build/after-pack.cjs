const { execFileSync } = require("node:child_process");
const path = require("node:path");

const CAMERA_USAGE =
  "ClawBrow は眉や表情の動きから詰まっている瞬間を検知するためにカメラを使用します。映像はすべて端末内で処理され、外部に送信されません。";
const MICROPHONE_USAGE = "ClawBrow は音声を録音しません。Electron の media 権限初期化に必要な説明文です。";

function setPlistValue(plist, key, type, value) {
  try {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plist], {
      stdio: "ignore"
    });
  } catch {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", `Add :${key} ${type} ${value}`, plist], {
      stdio: "ignore"
    });
  }
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const frameworksDir = path.join(context.appOutDir, "ClawBrow.app", "Contents", "Frameworks");
  const helperNames = [
    "ClawBrow Helper.app",
    "ClawBrow Helper (Renderer).app",
    "ClawBrow Helper (Plugin).app",
    "ClawBrow Helper (GPU).app"
  ];

  for (const helperName of helperNames) {
    const plist = path.join(frameworksDir, helperName, "Contents", "Info.plist");
    setPlistValue(plist, "NSCameraUsageDescription", "string", CAMERA_USAGE);
    setPlistValue(plist, "NSCameraUseContinuityCameraDeviceType", "bool", "true");
    setPlistValue(plist, "NSMicrophoneUsageDescription", "string", MICROPHONE_USAGE);
  }
};
