# Crunchyroll Volume Boost

A Manifest V3 browser extension that extends Crunchyroll's player volume control from 100% to 600%.

The extension preserves Crunchyroll's original volume slider looks and functionality, only increasing the limit of the volume. It doesn't make any network requests nor collect any data.



## Installation

1. Download or clone this repository.
2. Open your browser's extensions page:

   * Chrome: `chrome://extensions`
   * Edge: `edge://extensions`
   * Brave: `brave://extensions`
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Select the downloaded repository's folder.
6. Reload any open Crunchyroll watch page.

Now you can hover over the normal speaker button and slide the volume past 100%. Your new selected volume is saved locally



## Controls

* Arrow keys adjust volume in 5% steps below 100%, then 10% steps above it.
* Page Up and Page Down now increment in 50% steps.
* Home and End changes volume to 0% and 600% respectively instead of the previous 0% and 100%.
* The dragging continues to work seamlessly and the mute restores the correct audio level.



## How it works

Below 100%, the extension uses the content's normal volume. Above 100%, it applies Web Audio gain to the native volume. A dynamics compressor is then enabled in the boosted range to soften any clipping.

Only the `storage` permission is requested by the extension, which is used to remember the selected volume percentage.



## Safety

It is recommended to start the volume low and increase it gradually. A high volume boost can distort content that is already loud and could damage your hearing or speakers.



## License

Licensed under the [MIT License](LICENSE.md).

This is an unofficial project and is not affiliated with or endorsed by Crunchyroll.
