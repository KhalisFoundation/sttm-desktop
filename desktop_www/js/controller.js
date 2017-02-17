module.exports = {
  sendLine: function(lineID) {
    platform.ipc.send("show-line", {lineID: lineID});
  },

  sendText: function(text) {
    platform.ipc.send("show-text", {text: text});
  }
}
platform.ipc.on("updating", function(event, data) {
  document.body.classList.add("updating");
});
platform.ipc.on("openSettings", () => {
  settings.openSettings();
});
