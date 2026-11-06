# Aadishakti Mobiles – Diwali Dhamaka 2026 · Spin & Win

Pure HTML + CSS + vanilla JS. No build step, no backend.
Open `index.html` in a browser (or host the folder on any static host).

## Edit the prizes / odds
`js/script.js` → `PRIZES` array. `weight: 0` = shown on wheel but can never win
(Thailand Trip, Goa Trip). The other five have weight 20 each (= 20 % each).

## One spin per customer
`SpinGate` in `js/script.js` stores the result in LocalStorage (plus a cookie mirror).
This is one spin per **browser**, not per person. To go further, add OTP in
`SpinGate.verifyCustomer()` and move `SpinGate.read/record` and `PrizeService.draw`
to server calls. The rest of the app does not need to change.

To reset for testing: clear site data, or run `localStorage.clear()` and delete the cookie
`aadishakti_diwali_2026_spin` in the browser console.

## Files
index.html · css/style.css · js/script.js · assets/ (poster, gift PNGs, Thailand & Goa art)
