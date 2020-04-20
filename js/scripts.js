const AMIIBO_API_URL = "https://www.amiiboapi.com/api/amiibo/";
const EMUIIBO_REPO = "https://github.com/XorTroll/emuiibo";

$(document).ready(async function () {
  let amiiboList = await getAllAmiibos();
  let amiiboApiStatusElement = $("#amiibo-api-status");
  let statusIconElement = $("#status-icon");
  if (!amiiboList) {
    amiiboApiStatusElement.text("Unable to download amiibo list from AmiiboAPI.");
    statusIconElement.text("warning").removeClass("text-info").addClass("text-danger");
    return;
  }
  amiiboApiStatusElement.text("AmiiboAPI was accessed - amiibo list was loaded.");
  statusIconElement.text("check_circle").removeClass("text-info").addClass("text-success");
  let amiiboSeries = getAmiiboSeries(amiiboList);
  let amiiboSeriesElement = $("#select-amiibo-series");
  for (let [index, series] of amiiboSeries.entries()) {
    amiiboSeriesElement.append(new Option(series, index));
  }
  $("body").data("amiiboList", amiiboList);
  amiiboSeriesElement.change();
  $("#check-use-name-as-directory").prop("checked", true).change();
});

async function getAllAmiibos() {
  toggleLoader(true);
  let apiResponse;
  try {
    apiResponse = await $.ajax(AMIIBO_API_URL);
    toggleLoader(false);
  } catch (ex) {
    console.log(ex);
    toggleLoader(false);
    return null;
  }
  if (!apiResponse || !apiResponse.hasOwnProperty("amiibo") || apiResponse.amiibo.length === 0) {
    console.log("Unable to download amiibo list from AmiiboAPI.");
    return null;
  }
  apiResponse.amiibo.map((amiibo, index) => {
    amiibo.index = index;
    return amiibo
  });
  return apiResponse.amiibo;
}

function getAmiiboSeries(amiiboList) {
  let amiiboSeriesSet = new Set();
  for (let amiibo of amiiboList) {
    amiiboSeriesSet.add(amiibo.amiiboSeries);
  }
  return Array.from(amiiboSeriesSet);
}

function getAmiibosBySeries(amiiboList, amiiboSeries) {
  return amiiboList.filter(amiibo => amiibo.amiiboSeries === amiiboSeries);
}

function loadSelectAmiibos() {
  let selectElement = $("#select-amiibo");
  let amiiboList = $("body").data("amiiboList");
  if (!amiiboList) {
    return
  }
  let currentSeries = $("#select-amiibo-series :selected").text();
  let currentSeriesAmiibos = getAmiibosBySeries(amiiboList, currentSeries);
  if (!currentSeriesAmiibos) {
    return
  }
  selectElement.empty();
  for (let amiiboData of currentSeriesAmiibos) {
    selectElement.append(new Option(amiiboData.name, amiiboData.index));
  }
  selectElement.change();
}

function getAmiiboData(amiiboIndex) {
  let amiiboList = $("body").data("amiiboList");
  if (!amiiboList || amiiboList.length <= amiiboIndex) {
    return null;
  }
  return amiiboList[amiiboIndex];
}

function loadSelectedAmiiboData() {
  let currentAmiiboindex = $("#select-amiibo").val();
  let amiiboData = getAmiiboData(currentAmiiboindex);
  if (!amiiboData) {
    return;
  }
  $("#img-amiibo").prop("src", amiiboData.image);
  $("#input-name-amiibo").val(amiiboData.name);
}

function changeDirectoryOption() {
  let checkboxElement = $("#check-use-name-as-directory");
  let directoryElement = $("#input-directory-name");
  directoryElement.val("");
  directoryElement.prop("disabled", checkboxElement.prop("checked"));
}

function parseHexStrToUint16(hexStr) {
  return parseInt(hexStr, 16) & 0xFFFF;
}

function parseHexStrToUint8(hexStr) {
  return parseInt(hexStr, 16) & 0xFF;
}

function reverseUint16Bytes(uInt16Number) {
  let byte1 = (uInt16Number & 0xFF) << 8;
  let byte2 = (uInt16Number >> 8) & 0xFF;
  return (byte1 | byte2) & 0xFFFF;
}

function buildAmiiboJSON(amiiboData) {
  let amiiboJSON = {
    "name": $("#input-name-amiibo").val(),
    "write_counter": 0,
    "version": 0,
    "mii_charinfo_file": "mii-charinfo.bin"
  }

  let currDate = new Date();
  amiiboJSON.first_write_date = {
    "y": currDate.getFullYear(),
    "m": currDate.getMonth() + 1,
    "d": currDate.getDate()
  };
  amiiboJSON.last_write_date = amiiboJSON.first_write_date;

  let id = amiiboData.head + amiiboData.tail;

  if (id.length !== 16) {
    console.log("Invalid amiibo ID");
  }

  let character_game_id_str = id.substr(0, 4);
  let character_variant_str = id.substr(4, 2);
  let figure_type_str = id.substr(6, 2);
  let model_no_str = id.substr(8, 4);
  let series_str = id.substr(12, 2);

  amiiboJSON.id = {
    "game_character_id": reverseUint16Bytes(parseHexStrToUint16(character_game_id_str)),
    "character_variant": parseHexStrToUint8(character_variant_str),
    "figure_type": parseHexStrToUint8(figure_type_str),
    "series": parseHexStrToUint8(series_str),
    "model_number": parseHexStrToUint16(model_no_str)
  };

  if (!$("#check-randomize-uuid").prop("checked")) {
    amiiboJSON.uuid = [];
    for (let i = 0; i < 7; i++) {
      amiiboJSON.uuid[i] = Math.floor(Math.random() * 256);
    }
    amiiboJSON.uuid[7] = amiiboJSON.uuid[8] = amiiboJSON.uuid[9] = 0;
  }

  return amiiboJSON;
}

async function saveAmiibo() {
  let currentAmiiboindex = $("#select-amiibo").val();
  let amiiboData = getAmiiboData(currentAmiiboindex);
  let amiiboJSON = buildAmiiboJSON(amiiboData);
  let amiiboDirectoryName = amiiboJSON.name;
  if (!$("#check-use-name-as-directory").prop("checked")) {
    amiiboDirectoryName = $("#input-directory-name").val();
  }
  let zip = new JSZip();
  zip.folder(amiiboDirectoryName).file("amiibo.json", JSON.stringify(amiiboJSON, null, 2)).file("amiibo.flag", "");
  if ($("#check-save-amiibo-image").prop("checked")) {
    let imageData;
    try {
      imageData = await JSZipUtils.getBinaryContent(amiiboData.image, null);
      zip.folder(amiiboDirectoryName).file("amiibo.png", imageData, {binary: true});
    } catch (ex) {
      console.log(ex);
    }
  }
  let base64 = await zip.generateAsync({type: "base64"});
  let base64url = "data:application/zip;base64," + base64;
  download("amiibo.zip", base64url);
}

function download(filename, base64url) {
  let bodyElement = $("body");
  let downloadElement = document.createElement('a');
  $(downloadElement).attr("href", base64url).attr("download", filename).css("display", "none");
  bodyElement.append(downloadElement);
  downloadElement.click();
  bodyElement.remove(downloadElement);
}

function openEmuiiboRepo() {
  window.open(EMUIIBO_REPO, "_blank");
}

function showRandomizeUUIDModal() {
  let checkboxElement = $("#check-randomize-uuid");
  if (checkboxElement.prop("checked")) {
    checkboxElement.prop('checked', false)
    $("#random-uuid-modal").modal();
  }
}

function toggleLoader(enabled) {
  let loaderElement = $(".lds-ring");
  let backgroudElement = $(".loader-background");
  if (enabled) {
    loaderElement.show();
    backgroudElement.show();
  } else {
    loaderElement.hide();
    backgroudElement.hide();
  }
}