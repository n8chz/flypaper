function clearExistingPopouts() {
 // TODO
}


function plusHandler(event) {
 setPlusMinus(this, "minus");
 event.stopPropagation();
 self.port.emit("folderPlus", this.id);
}

function minusHandler(event) {
 setPlusMinus(this, "plus");
 var existingPopouts = this.getElementsByClassName("popout");
 for (var k = 0; k < existingPopouts.length; k++) {
  this.removeChild(existingPopouts.item(k));
 }
 event.stopPropagation();
}

function setPlusMinus(el, newClassName) {
 var isMinus = newClassName == "minus";
 var oldClassName = isMinus ? "plus" : "minus";
 // alert("Setting #"+el.id+" from "+oldClassName+" to "+newClassName);
 var oldEventListener = isMinus ? plusHandler : minusHandler;
 var newEventListener = isMinus ? minusHandler : plusHandler;
 var classList = el.classList;
 classList.remove(oldClassName);
 classList.add(newClassName);
 el.removeEventListener("click", oldEventListener);
 el.addEventListener("click", newEventListener);
}

function createFolderEntry(id, title, matchExpression) {
 var newEntry = document.createElement("div");
 newEntry.id = id;
 var newTitleSpan = document.createElement("span");
 newTitleSpan.textContent = title;
 newTitleSpan.classList.add("title");
 newEntry.appendChild(newTitleSpan);
 var matchSpan = document.createElement("span");
 matchSpan.classList.add("match");
 newEntry.appendChild(matchSpan);
 if (matchExpression && matchExpression != undefined && matchExpression != "") {
  matchSpan.textContent = matchExpression;
 }
 else {
  matchExpression = "";
 }
 var button = document.createElement("button");
 button.textContent = "\u270e";
 button.setAttribute("title", "Add/edit match expression for this folder.");
 button.addEventListener("click", function (event) {
   event.stopPropagation();
   var newMatchExpression = window.prompt("Enter regular expression to be found in pages to be added to this folder:", matchExpression);
   matchSpan.textContent = newMatchExpression;
   self.port.emit("newMatchExpression", JSON.stringify({
     "id": id,
     "matchExpression": newMatchExpression
   }));
 });
 newEntry.appendChild(button);
 var newFolder = document.createElement("button");
 newFolder.textContent = "+";
 newFolder.setAttribute("title", "Create new subfolder for this folder.");
 newFolder.classList.add("newfolder");
 newFolder.addEventListener("click", function (event) {
   var folderName = window.prompt("Name of new folder:");
   self.port.emit("newFolder", JSON.stringify({
     "parentId": id,
     "folderName": folderName
   }));
 });
 newEntry.appendChild(newFolder);
 return newEntry;
}

self.port.on("updateFolders", function (folderListJSON) {
  // folderListJSON is a JSON.stringified object from folderAndChildren in ( ../lib/main.js ).  It represents one folder within the bookmarks folder hierarchy, and its immediate children.  This is the amount of information necessary for the action of opening a folder and displaying its top-level child folders.

  // console.log("updateFolders emitted with: "+folderListJSON);

  // Retrieve top-level folder attributes:
  var folderList = JSON.parse(folderListJSON);
  var id = folderList.id;
  var title = folderList.title;
  var matchExpression = folderList.matchExpression;

  // Look for folder's corresponding element in tab:
  var element = document.getElementById(id); // will return null if not found

  // If not found, create it:
  if (!element) {
   element = createFolderEntry(id, title, matchExpression);
   document.body.appendChild(element);
  }

  setPlusMinus(element, "minus");

  var children = folderList.children;
  if (children.length > 0) {
   var subElement = document.createElement("div");
   subElement.classList.add("popout");
   var subFolderElement = null;
   for each (var child in children) {
    subFolderElement = createFolderEntry(child.id, child.title, child.matchExpression);
    subElement.appendChild(subFolderElement);
    setPlusMinus(subFolderElement, "plus");
   }
   var existingPopouts = element.getElementsByClassName("popout");
   for (var k = 0; k < existingPopouts.length; k++) {
    element.removeChild(existingPopouts.item(k));
   }
   element.appendChild(subElement);
  }
});

