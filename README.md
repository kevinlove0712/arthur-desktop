# 亚瑟桌面宠物

独立的 Electron 桌面应用（日常使用离线），复用原有 1536×2288 透明图集，不需要 Codex。

![亚瑟动作预览](docs/preview.gif)

## 下载与使用

从 [Releases](https://github.com/kevinlove0712/arthur-desktop/releases) 下载对应版本，完整解压后运行。最终用户不需要 Node.js、Codex、账号或 API Key。

- **macOS Apple 芯片**：运行 `Arthur.app`，旁边保留“自定义”文件夹。只把应用拖入“应用程序”时，配置会改用用户数据目录。
- **macOS Intel**：运行 Intel 版 `Arthur.app`。
- **Windows x64**：完整保留解压文件夹，运行 `Arthur.exe`。

按住拖动移动；单击跳跃；双击挥爪；鼠标靠近时目光跟随。右键宠物或点击菜单栏/托盘图标，可选择胖背影等动作、调整大小、找回宠物或退出。

当前为测试发行版：Mac Apple 芯片原生、Mac Intel 经 Rosetta 已测试；Windows 尚未真机运行验证。未完成开发者签名与 Apple 公证，首次打开可能出现系统提示。

## 1.1.0 的设置

右键菜单 → **设置…**。原有动画、拖动、单击、双击、视线跟随、透明穿透和置顶功能保留。

| 设置 | 默认值 | 可调整内容 |
| --- | --- | --- |
| 大小 | 100%（原来的标准大小，240×260） | 50%～200%，整数百分比 |
| 偶尔动一动 | 30 秒 | 5～86400 秒，每次独立随机 ±20% |
| 屏幕走动 | 每走完休息 120 秒 | 10～86400 秒，每次独立随机 ±20% |
| 走动范围 | 当前屏幕底部一排 | 整个屏幕，或九宫格中的一格 |
| 整点提醒 | 开 | 随机一句文案和一个动作，显示 12 秒 |

走动会避开任务栏和 Dock；在范围外时先走入范围。拖动或打开菜单会暂停。小格装不下宠物时以屏幕边界为准。电脑休眠后重置走动计时，不补报错过的整点。

安装压缩包内的 **自定义/** 文件夹包含 `设置.txt`、`整点文案.txt` 和 `如何修改.txt`。所有字段都有默认值和中文说明；保存为 UTF-8 后重启生效。在设置窗口保存会立即生效并重写 `设置.txt`，文案保留。整点文案支持 `{hour}` 与 `{time}` 占位符，每行一句，`#` 开头是注释。

Windows 使用 exe 旁的自定义文件夹，Mac 使用 .app 旁的文件夹；安装目录不可写、只移动了 .app、或位于“应用程序”时，改用系统用户数据目录并提示。**右键 → 打开自定义文件夹** 始终指向正在使用的副本。不要修改 .app 内部文件，以免破坏签名。

**检查更新** 仅在点击时访问本项目 GitHub Releases（包含标明的测试发行版），按当前平台提供下载入口。当前 ZIP 免安装版本需要手动解压替换并保留自定义文件夹，尚不支持自动下载安装。Electron 内置 Mac 自动更新需要签名，Windows 需要兼容的安装格式，见 [官方更新说明](https://www.electronjs.org/docs/latest/api/auto-updater)。

## 开发

需要 Node.js 22.12 或更高版本。首次安装需要网络。

```sh
npm ci
npm start
npm test
npm run test:app
npm run test:features
```

## 分平台打包

在 macOS 上可构建这三个独立压缩包（打包需要 Python 3，用于正确保存中文文件名与 Mac 符号链接）：

```sh
npm run package -- mac-arm64
npm run package -- mac-x64
npm run package -- windows-x64
```

默认生成到项目根目录的 `releases/`；`build/` 是中间应用目录。Mac 使用本地临时签名（ad-hoc），没有开发者签名和公证。Windows 包没有发布者签名。不要把跨平台打包成功当作已在对应系统实测。

`main.cjs` 负责窗口、走动、整点提醒及托盘；`preferences.cjs` 读写中文配置；`updates.cjs` 检查发行版本；`renderer.js` 播放已有帧并进行透明像素命中检测；`model.js` 定义帧时长和视线方向。图像及界面资源全部本地加载；渲染器禁用 Node，启用沙盒和上下文隔离。

参考：[Electron 透明窗口](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles)、[点击穿透](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions)、[Electron Packager](https://electron.github.io/packager/main/)。

## 许可证

项目采用 [MIT License](LICENSE)。Electron 及其他依赖保留各自的许可证。
