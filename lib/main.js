
var {
    Cc, Ci, Cu
} = require("chrome");

// see https://developer.mozilla.org/en-US/docs/Retrieving_part_of_the_bookmarks_tree?redirectlocale=en-US&redirectslug=Places%2FAccessing_Bookmarks#Complete_code_listing
var historyService = Cc["@mozilla.org/browser/nav-history-service;1"]
    .getService(Ci.nsINavHistoryService);
var options = historyService.getNewQueryOptions();
var query = historyService.getNewQuery();

var bookmarksService = Cc["@mozilla.org/browser/nav-bookmarks-service;1"]
    .getService(Ci.nsINavBookmarksService);
var bookmarksFolder = bookmarksService.bookmarksMenuFolder;

query.setFolders([bookmarksFolder], 1);

var result = historyService.executeQuery(query, options);
var rootNode = result.root;

// for adding bookmarks for matching pages encountered ( see https://developer.mozilla.org/en-US/docs/Manipulating_bookmarks_using_Places#Creating_a_new_bookmark )
var ios = Cc["@mozilla.org/network/io-service;1"]
                    .getService(Ci.nsIIOService);

// for tagging all URL's bookmarked with this add-on to aid in winnowing down of catch ( see https://developer.mozilla.org/en-US/docs/Using_the_Places_tagging_service )
var taggingSvc = Cc["@mozilla.org/browser/tagging-service;1"]
                           .getService(Ci.nsITaggingService);



// Add-on SDK API's to use:
var pageMod = require("sdk/page-mod");
var data = require("sdk/self").data;
var tabs = require("sdk/tabs");
var ui = require("sdk/ui");
var panel = require("sdk/panel");
var sidebar = require("sdk/ui/sidebar");
var ss = require("sdk/simple-storage");

Cu.import("resource://gre/modules/Dict.jsm"); // see http://www.less-broken.com/blog/2010/12/lightweight-javascript-dictionaries.html

if (!ss.storage.dictJSON) {
 ss.storage.dictJSON = (new Dict()).toJSON;
}

// kludge b/c "[p]roperties with array, boolean, number, object, null, and string values will be persisted [in simple storage]," per https://developer.mozilla.org/en-US/Add-ons/SDK/High-Level_APIs/simple-storage#storage :
var dict = new Dict(ss.storage.dictJSON); // Yeah, I know, a global variable


function containerResultNodeAt(id) {
 var query = historyService.getNewQuery();
 query.setFolders([id], 1);
 var options = historyService.getNewQueryOptions();
 var result = historyService.executeQuery(query, options);
 return result.root;
}

// Generate SimpleObject representing folder and its first-level children:
function folderAndChildren(folder) {
 var id = folder.itemId;
 // console.log(dict.toJSON);
 var value = {
  "id": id,
  // "parent": folder.parent ? folder.parent.itemId : null,
  "title": folder.title,
  "matchExpression": dict.get(id),
  "children": []
 };
 folder.containerOpen = true;
 var child, childId;
 for (var k = 0; k < folder.childCount; k++) {
  child = folder.getChild(k);
  childId = child.itemId;
  if (child.type == child.RESULT_TYPE_FOLDER) {
   value.children.push({
     "id": childId,
     "title": child.title,
     "matchExpression": dict.get(childId)
   });
  }
 }
 folder.containerOpen = false;
 return value;
}

// Open a tab in which bookmarks folder structure will be displayed:
function openFoldersTab() {
    tabs.open({
        url: data.url("folders.html"),
        onReady: function (tab) {
            var worker = tab.attach({
                contentScriptFile: data.url("folders.js")
            });
            worker.port.on("folderPlus", function (id) {
              var containerResultNode = containerResultNodeAt(id);
              // see https://people.mozilla.org/~dietrich/places/interfacens_i_nav_history_container_result_node.html
              worker.port.emit("updateFolders", JSON.stringify(folderAndChildren(containerResultNode)));
            });
            worker.port.emit("updateFolders", JSON.stringify(folderAndChildren(rootNode)));
            worker.port.on("newMatchExpression", function (matchPairJSON) {
              mapPair = JSON.parse(matchPairJSON);
              if (mapPair.matchExpression == "") {
               dict.del(mapPair.id);
              }
              else {
               dict.set(mapPair.id, mapPair.matchExpression);
              }
              ss.storage.dictJSON = dict.toJSON(); // Make the previous line persistent.
            });
            worker.port.on("newFolder", function (folderInfoJSON) {
              var folderInfo = JSON.parse(folderInfoJSON);
              var parentId = folderInfo.parentId;
              var folderName = folderInfo.folderName;
              if (folderName.match(/\S/)) {
               bookmarksService.createFolder(parentId, folderName, bookmarksService.DEFAULT_INDEX);
               worker.port.emit("updateFolders", JSON.stringify(folderAndChildren(containerResultNodeAt(parentId))));
              }
            });
        }
    });
}

// Press this widget (um, ActionButton) to open folders tab:
var foldersWidget = ui.ActionButton({
    id: "foldersWidget",
    label: "Edit flypaper in bookmark folders",
    // h/t https://commons.wikimedia.org/wiki/File:Housefly_-_Project_Gutenberg_eText_18050.jpg
    icon: data.url("fly.png"),
    onClick: openFoldersTab
});


var matchText = pageMod.PageMod({
  include: ["*"],
  contentScriptWhen: "ready",
  contentScriptFile: data.url("text.js"),
  onAttach: function (worker) {
   worker.port.emit("getText");
   worker.port.on("gotText", function (pageInfoJSON) {
     pageInfo = JSON.parse(pageInfoJSON);
     var uri = ios.newURI(pageInfo.url, null, null);
     // see https://groups.google.com/d/msg/mozilla.dev.extensions/49KHKMGesCc/HuAArrPp_2wJ
     if (!bookmarksService.getBookmarkedURIFor(uri)) { // don't bookmark URI multiple times
      dict.listitems().forEach(function (item) {
        id = item[0];
        matchExpression = item[1];
        var textToMatch = `${pageInfo.url} ${pageInfo.title} ${pageInfo.text}`;
        var matchStrings = textToMatch.match(new RegExp(matchExpression, "igm"));
        if (matchStrings && matchStrings.every(function (x) {
          return x != "null" && x != null;
        })) {
         // Use matching strings as tags, for easier future reference:
         for (var k = 0; k < matchStrings.length; k++) {
          if (matchStrings[k] != "null")
           taggingSvc.tagURI(uri, [matchStrings[k].toLowerCase()]);
         }
         // var node = containerResultNodeAt(id);
         // see https://developer.mozilla.org/en-US/docs/Manipulating_bookmarks_using_Places#Creating_a_new_bookmark
         var newBkmkId = bookmarksService.insertBookmark(id, uri, bookmarksService.DEFAULT_INDEX, pageInfo.title);
         // see https://developer.mozilla.org/en-US/docs/Using_the_Places_tagging_service
         taggingSvc.tagURI(uri, ["bookmarks-flypaper"]);
         // see also https://developer.mozilla.org/en-US/docs/Places_Developer_Guide?redirectlocale=en-US&redirectslug=Places_migration_guide#Tags
         // alert("Bookmarks Flypaper bookmarked this page.");
        }
      });
     }
   });
  }
});
