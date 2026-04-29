const { execFileSync } = require("node:child_process");
const path = require("node:path");

const CAMERA_USAGE =
  "ClawSense は表情から困っている瞬間を検知するためにカメラを使用します。映像はすべて端末内で処理され、外部に送信されません。";
const MICROPHONE_USAGE = "ClawSense は音声を録音しません。Electron の media 権限初期化に必要な説明文です。";

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

  const frameworksDir = path.join(context.appOutDir, "ClawSense.app", "Contents", "Frameworks");
  const helperNames = [
    "ClawSense Helper.app",
    "ClawSense Helper (Renderer).app",
    "ClawSense Helper (Plugin).app",
    "ClawSense Helper (GPU).app"
  ];

  for (const helperName of helperNames) {
    const plist = path.join(frameworksDir, helperName, "Contents", "Info.plist");
    setPlistValue(plist, "NSCameraUsageDescription", "string", CAMERA_USAGE);
    setPlistValue(plist, "NSCameraUseContinuityCameraDeviceType", "bool", "true");
    setPlistValue(plist, "NSMicrophoneUsageDescription", "string", MICROPHONE_USAGE);
  }
};
