function sendLine(lineID) {
  ipc.send("show-line", {lineID: lineID});
}
function sendText(text) {
  ipc.send("show-text", {text: text});
}
ipc.on("updating", function(event, data) {
  document.body.classList.add("updating");
});
ipc.on("openSettings", () => {
  openSettings();
});
