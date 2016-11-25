var currentShabad,
    currentLine;

//IPC
var ipc = require("electron").ipcRenderer;
ipc.on("show-line", function(event, data) {
  var content = db.exec("SELECT gurmukhi, english_ssk, transliteration, sggs_darpan FROM shabad WHERE _id = " + data.lineID);
  var item = content[0].values[0];
  
  makeSlide([
    $("<h1></h1>").addClass("gurmukhi").text(item[0]),
    $("<h2></h2>").css("color","#fcf").text(item[1]),
    $("<h2></h2>").css("color","#ffc").text(item[2]),
    $("<h2></h2>").css("color","#cff").text(item[3]),
  ]);
});

ipc.on("show-text", function(event, data) {
  makeSlide([$("<h1></h1>").addClass("gurmukhi").text(data.text)]);
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

