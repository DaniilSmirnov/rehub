# Device picture-in-picture

On the device control page, use **Picture-in-picture** in the device toolbar to
move the live screen, device toolbar and navigation buttons into an always-on-top window. Keep
the device tab open; switching tabs or applications leaves the mini-window open.

The mini-window supports the same screen gestures, navigation buttons and
keyboard input as the device tab. The top toolbar retains portrait/landscape and
stream quality controls; **Return to tab** replaces **Stop Using**. Quality uses a
native range input in PiP so dragging and keyboard input stay in the correct
document. Click the phone screen before typing. Closing
the window or choosing **Return to tab** restores the existing canvas and controls
without creating another device session. Leaving the device control page closes
the mini-window.

This uses the Document Picture-in-Picture API, available in supporting desktop
Chromium browsers in a secure context (HTTPS or localhost). In other browsers the
toolbar action is disabled with an explanation. Tizen's inspector view is excluded.
There is no video-only fallback: that would lose interactive device control.

Opening the mini-window requires a click. Switching tabs alone does not open it.
Chrome's automatic PiP for media playback has additional eligibility conditions,
including audible playback, that the device canvas stream does not satisfy.

The existing canvas is rendered through a stable React portal, whose container
moves between documents. Both JPEG/minicap and H.264/scrcpy use the same screen.
H.264 rendering follows the canvas owner's animation clock so a hidden opener
does not suspend the mini-window's frame updates. Device streams and backend
control APIs are unchanged.

References:

- [Document PiP](https://developer.chrome.com/docs/web-platform/document-picture-in-picture)
- [Automatic PiP requirements](https://developer.chrome.com/blog/automatic-picture-in-picture-media-playback)
