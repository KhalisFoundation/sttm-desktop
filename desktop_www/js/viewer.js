//IPC
var ipc = require("electron").ipcRenderer;
ipc.on("show-line", function(event, data) {
  makeSlide([$("<h1></h1>").text(data.lineID)]);
});

ipc.on("show-text", function(event, data) {
  makeSlide([$("<h1></h1>").text(data.text)]);
})

function makeSlide(appendObj) {
  $("#slide").fadeOut(function() {
    $(this).remove();
    var slide = $("<div></div>")
                  .attr("id", "slide");
    for (x = 0; x < appendObj.length; x++) {
      slide.append(appendObj[x]);
    }
    slide.prependTo("body");
  })
}

