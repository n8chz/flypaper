self.port.on("getText", function () {
  if (document.body) {
   self.port.emit("gotText", JSON.stringify({
     url: document.location.href, // "document.location is null"
     title: document.title,
     text: document.body.textContent
   }));
  }
});

