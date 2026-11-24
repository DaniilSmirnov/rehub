# Watching devices under automation

A device reserved through `POST /api/v1/user/devices` carries `usage: automation`.
Other users who can see the device's group may watch its screen read-only, without
taking the device or interrupting the test. This works for Android and iOS devices.

## In the UI

On the Devices page such a device shows a **Watch** button instead of **Busy**.
It opens `#/watch/<serial>`: only the screen, with no controls, no input and no
ownership request. When the automation reservation ends the page shows
**Automation finished**.

## How it works

1. The UI asks `GET /api/v1/devices/{serial}/watch`. The API checks that the device
   is in one of the user's groups and is under automation, and returns a token
   valid for one minute, bound to that user and that device.
2. The UI opens the device's screen WebSocket with that token instead of the session
   token. The device worker accepts it only while its current lease has usage
   `automation`, and only for its own serial.
3. A viewer can turn its own stream on and off, but its `size` messages are ignored,
   so the owner's projection never changes. Input is not possible: the websocket
   unit only forwards device commands from the device owner.
4. Any change of owner (release, timeout, takeover) closes viewer streams with code
   `1008` and reason `Automation finished`.

Ported in spirit from DeviceFarmer/stf@f988d331; stf's UI and its per-packet input
authorization are not ported, rehub already restricts input to the owner.
