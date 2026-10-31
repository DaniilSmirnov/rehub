# Running iPhones on Linux (experimental)

By default rehub drives real iPhones from macOS: Xcode builds and starts WebDriverAgent (WDA)
and `idb` reads device details, installs apps and streams logs. With `--ios-backend go-ios`
the provider and its device workers use [go-ios](https://github.com/danielpaulus/go-ios)
instead, so an iPhone can be connected to a Linux machine. A Mac is still needed once, to build
and sign the WDA runner.

The approach follows DeviceFarmer/stf@5efdfdb4 (experimental Linux iPhone support), adapted to
rehub's own iOS provider: rehub still forwards WDA and MJPEG over usbmuxd and keeps its
screen stream, touch and controls.

## What the go-ios backend does

| Task | xcode backend | go-ios backend |
| --- | --- | --- |
| Find connected iPhones | USB hotplug + `xcrun simctl` | `ios list` every 2 s (no simulators) |
| Device name, model, iOS version | `idb describe` | `ios info` |
| Start WDA | Xcode build and launch | `ios image auto`, then `ios runwda` of the installed runner |
| Install / launch / uninstall apps | `idb install/launch/uninstall` | `ios install/launch/uninstall` |
| Device log | `idb log` | `ios syslog --nojson` |
| File browser | `idb file` | not supported |

After an install, the go-ios backend does not open the app, because go-ios does not report the
bundle id it installed.

## Requirements on the Linux host

- `usbmuxd` running (Debian/Ubuntu: `apt install usbmuxd libimobiledevice-utils`).
- go-ios 1.3 or later on `PATH`, or pass its path with `--go-ios-path`.
- The iPhone paired with the host: unlock it, run `ios pair --udid=<udid>` and accept the prompt.
  Developer Mode must be on.
- iOS 17 and later: a go-ios tunnel running for the device, for example
  `sudo ios tunnel start --userspace` (keep it running as a service).
- A signed WDA runner installed on the iPhone. Build it once on a Mac from
  `node_modules/appium-webdriveragent` (`npm run setup-wda` opens the project), sign it with your
  team, and install the resulting `WebDriverAgentRunner-Runner.app` with
  `ios install --path=WebDriverAgentRunner-Runner.app --udid=<udid>`.
  Its bundle id is what `--wda-bundle-id` names; the test runner id defaults to
  `<wda-bundle-id>.xctrunner` (`--wda-test-runner-bundle-id` to change it).

The worker mounts the developer disk image itself (`ios image auto`) before starting WDA. That
needs Internet access the first time.

## Running the provider

```bash
stf ios-provider \
    --ios-backend go-ios \
    --wda-bundle-id com.example.WebDriverAgentRunner \
    --connect-processor tcp://127.0.0.1:7160 \
    --screen-ws-url-pattern 'ws://localhost:<%= publicPort %>' \
    --public-ip localhost \
    --provider linux-ios \
    --storage-url http://localhost:7100/
```

Every option can also be set through the environment (`DH_IOS_BACKEND=go-ios`,
`DH_GO_IOS_PATH=/usr/local/bin/ios`, and so on).

## Troubleshooting

- The iPhone is not listed: check `ios list`; if it is empty, usbmuxd does not see the device or
  the device is not trusted.
- WDA does not start: run the same command the worker runs and read its output:
  `ios runwda --bundleid=<id> --testrunnerbundleid=<id>.xctrunner --xctestconfig=WebDriverAgentRunner.xctest --udid=<udid>`.
  On iOS 17+ this fails without a running tunnel. An expired signing profile also stops it.
