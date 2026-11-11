"use strict";
/*
 * app.js - UI for the 2D Edge of Chaos.
 * Control structure and example/file handling ported from David Eck's
 * 1D app (math.hws.edu/eck/js/edge-of-chaos/CA.html); engine calls go to
 * EO2D (engine.js). Additions over the original: painting, fading trail,
 * brush, seed display.
 */

// ------------------------------------------------------------------ palette
var DEFAULT_PALETTE = [
   [0x00,0x00,0x00], [0xCC,0xCC,0xCC],
   [0xFF,0x00,0x00], [0x00,0x00,0xFF], [0x00,0xDD,0x00], [0xFF,0x00,0xFF], [0x00,0xFF,0xFF], [0xFF,0xFF,0x00], [0x80,0x80,0x80],
   [0x88,0x00,0x00], [0x00,0x00,0x88], [0x00,0x88,0x00], [0x88,0x00,0x88], [0x00,0x88,0x88], [0x88,0x88,0x00], [0xDD,0xDD,0xDD],
   [0xFF,0xAA,0xAA], [0xAA,0xAA,0xFF], [0xAA,0xFF,0xAA], [0xFF,0xAA,0xFF], [0xAA,0xFF,0xFF], [0xFF,0xFF,0xAA], [0xFF,0xAA,0x55],
   [0x88,0x55,0x55], [0x55,0x55,0x88], [0x55,0x88,0x55], [0x88,0x55,0x88], [0x55,0x88,0x88], [0x88,0x88,0x55], [0x55,0xAA,0xFF],
   [0xAA,0xFF,0x55], [0x55,0x55,0x55]
];
var palette = DEFAULT_PALETTE;

// ------------------------------------------- palette editor (Eck's design)
var ccIsVisible = false;
var ccPalette, ccSliders, ccSelectedColor = -1, ccPatchList, ccColorPatches;

function showPaletteEditor() {
    if (ccIsVisible) return;
    if (!ccSliders) {
        ccSliders = new SliderCanvas("ccsliders");
        ccSliders.addSlider({label:"Red", min:0, max:255, step:1});
        ccSliders.addSlider({label:"Green", min:0, max:255, step:1});
        ccSliders.addSlider({label:"Blue", min:0, max:255, step:1});
        ccSliders.onChange = ccDoSliderChange;
    }
    var sliderWidth = window.innerWidth - 60;
    if (sliderWidth > 400) sliderWidth = 400;
    document.getElementById("ccsliders").style.width = sliderWidth + "px";
    document.getElementById("ccsliders").width = sliderWidth;
    ccPalette = [];
    ccColorPatches = [];
    ccPatchList = document.getElementById("ccpalette");
    for (var i = 0; i < eng.states; i++) {
        ccPalette.push([palette[i][0], palette[i][1], palette[i][2]]);
        var patch = document.createElement("div");
        patch.style.backgroundColor = "rgb(" + palette[i][0] + "," + palette[i][1] + "," + palette[i][2] + ")";
        patch.style.color = (palette[i][0] > 150 || palette[i][1] > 150) ? "black" : "white";
        patch.appendChild(document.createTextNode("" + i));
        patch.ccpatchnum = i;
        patch.onmousedown = function() { ccSelectPatchNum(this.ccpatchnum); };
        ccColorPatches[i] = patch;
        ccPatchList.appendChild(patch);
    }
    ccSelectPatchNum(0);
    document.getElementById("ccUI").style.display = "block";
    ccIsVisible = true;
    ccSliders.draw();
}
function hidePaletteEditor() {
    if (!ccIsVisible) return;
    document.getElementById("ccUI").style.display = "none";
    ccPalette = ccColorPatches = null;
    ccPatchList.innerHTML = "";
    ccIsVisible = false;
}
function acceptNewPalette() {
    var changed = false;
    for (var i = 0; i < ccPalette.length && !changed; i++)
        for (var j = 0; j < 3 && !changed; j++)
            if (palette[i][j] != ccPalette[i][j]) changed = true;
    palette = ccPalette;
    doShowPopup("none");
    if (changed) paletteChanged();
}
function cancelNewPalette() { doShowPopup("none"); }
function installStandardPalette(type) {
    if (!ccIsVisible) return;
    ccPalette = makePalette(ccPalette.length, type);
    for (var i = 0; i < ccPalette.length; i++) {
        ccColorPatches[i].style.backgroundColor =
            "rgb(" + ccPalette[i][0] + "," + ccPalette[i][1] + "," + ccPalette[i][2] + ")";
        ccColorPatches[i].style.color =
            (ccPalette[i][0] > 150 || ccPalette[i][1] > 150) ? "black" : "white";
    }
    ccSliders.setValue(0, ccPalette[ccSelectedColor][0]);
    ccSliders.setValue(1, ccPalette[ccSelectedColor][1]);
    ccSliders.setValue(2, ccPalette[ccSelectedColor][2]);
    ccSelectPatchNum(0);
}
function ccSelectPatchNum(num) {
    if (ccSelectedColor >= 0) {
        ccColorPatches[ccSelectedColor].style.borderColor = "black";
        ccColorPatches[ccSelectedColor].style.outline = "none";
    }
    ccSelectedColor = num;
    ccColorPatches[ccSelectedColor].style.borderColor = "yellow";
    ccColorPatches[ccSelectedColor].style.outline = "2px solid yellow";
    ccSliders.setValue(0, ccPalette[ccSelectedColor][0]);
    ccSliders.setValue(1, ccPalette[ccSelectedColor][1]);
    ccSliders.setValue(2, ccPalette[ccSelectedColor][2]);
    document.getElementById("ccnum").innerHTML = "" + num;
}
function ccDoSliderChange() {
    ccPalette[ccSelectedColor][0] = ccSliders.value(0);
    ccPalette[ccSelectedColor][1] = ccSliders.value(1);
    ccPalette[ccSelectedColor][2] = ccSliders.value(2);
    ccColorPatches[ccSelectedColor].style.backgroundColor =
        "rgb(" + ccPalette[ccSelectedColor][0] + "," +
                 ccPalette[ccSelectedColor][1] + "," +
                 ccPalette[ccSelectedColor][2] + ")";
    ccColorPatches[ccSelectedColor].style.color =
        (ccPalette[ccSelectedColor][0] > 150 || ccPalette[ccSelectedColor][1] > 150) ? "black" : "white";
}
function makePalette(stateCt, type) {
    // 1 White/Default 2 Black/Default 3 White/Spectrum 4 Black/Spectrum 5 Grays 6 Reverse Grays
    var newPalette = new Array(stateCt);
    for (var i = 0; i < stateCt; i++) {
        switch (type) {
            case 1: case 2:
                newPalette[i] = [DEFAULT_PALETTE[i][0], DEFAULT_PALETTE[i][1], DEFAULT_PALETTE[i][2]];
                break;
            case 3:
                newPalette[i] = (i == 0) ? [0,0,0] : getRGBFromHSV(360 * ((i - 1) / (stateCt - 1)), 1, 1);
                break;
            case 4:
                newPalette[i] = (i == 0) ? [255,255,255] : getRGBFromHSV(360 * ((i - 1) / (stateCt - 1)), 1, 0.7);
                break;
            case 5:
                newPalette[i] = getRGBFromHSV(0, 0, i / (stateCt - 1));
                break;
            case 6:
                newPalette[i] = getRGBFromHSV(0, 0, (stateCt - 1 - i) / (stateCt - 1));
                break;
        }
    }
    if (type == 2) { newPalette[0] = [255,255,255]; newPalette[1] = [0,0,0]; }
    return newPalette;
    function getRGBFromHSV(h, s, v) {
        var r, g, b, c, x;
        c = v * s;
        x = (h < 120) ? h / 60 : (h < 240) ? (h - 120) / 60 : (h - 240) / 60;
        x = c * (1 - Math.abs(x - 1));
        x += (v - c);
        switch (Math.floor(h / 60)) {
            case 0: r = v; g = x; b = v - c; break;
            case 1: r = x; g = v; b = v - c; break;
            case 2: r = v - c; g = v; b = x; break;
            case 3: r = v - c; g = x; b = v; break;
            case 4: r = x; g = v - c; b = v; break;
            case 5: r = v; g = v - c; b = x; break;
        }
        return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
    }
}

// ------------------------------------------------------------- global state
var eng = new EO2D.Engine();
var canvas, graphics, offCanvas, offCtx, imgData;
var cellSize = 2, xOff = 0;
var ticksPerGeneration = 3, ticksSinceLastGeneration = 0, stopGeneration = -1;
var running = false, lambdaChanging = false, canvasTimeout = null;
var trailOn = false;
var brushState = 1;
var painting = false, eraseDrag = false;
var currentPopup = "none";
var lambdaSlider;
var localStorageKey = "/local/edge-of-chaos-2d";
var localStorageItems;
var undoDeleteItem = null;

// Placeholder; real picks are written by test/pick-examples.js after probing.
// Entry: [name, ruleSeed, worldSeed, states, shape, mode, worldType, rulesUsed, cellSize, trail]
// rulesUsed -1 = the default one-third of the activation path.
var builtInExample = [
   ["", 551963439, 101, 4, "m1", "d4", 3, -1, 2, 0],
   ["", 4023837147, 202, 4, "m1", "permute", 3, -1, 2, 0],
   ["", 2587048127, 303, 2, "m1", "d4", 3, -1, 2, 0],
   ["", 2450470391, 404, 3, "vn2", "asym", 3, -1, 2, 0],
   ["", 1420500719, 505, 2, "vn2", "d4", 3, -1, 2, 0],
   ["", 3007691925, 606, 3, "vn1", "permute", 3, -1, 2, 0],
];

function $(id) { return document.getElementById(id); }
function shapeLabel(s) { return EO2D.SHAPES[s].label.replace(/\s*\(.*/, ""); }
function modeLabel(m) {
    return m === "d4" ? "D4 isotropic" : m === "asym" ? "asymmetric" : "permute (outer)";
}

function setInfo() {
    $("info").innerHTML = eng.states + " states, " + shapeLabel(eng.shape) + ", " +
        modeLabel(eng.mode) + ", " + eng.classCt + " rules";
}
function setSeedLine() {
    $("seedline").innerHTML = "rule seed " + eng.ruleSeed + " &#183; world seed " + eng.worldSeed +
        " &#183; generation " + eng.gen;
}
function setRulesUsedField() {
    $("rulesused").value = "" + (eng.rulesUsed + 1);
}

// ------------------------------------------------------------ world sizing
function computeSize() {
    return [Math.max(4, Math.floor(canvas.width / cellSize)),
            Math.max(4, Math.floor(canvas.height / cellSize))];
}
function fitWorld() {
    var wh = computeSize();
    eng.setWorldSize(wh[0], wh[1]);
}
function allocOff() {
    offCanvas.width = eng.W;
    offCanvas.height = eng.H;
    imgData = offCtx.createImageData(eng.W, eng.H);
}

// ---------------------------------------------------------------- drawing
function clearBoard() {
    graphics.fillStyle = "rgb(" + palette[0][0] + "," + palette[0][1] + "," + palette[0][2] + ")";
    graphics.fillRect(0, 0, canvas.width, canvas.height);
    var gw = eng.W * cellSize, gh = eng.H * cellSize;
    xOff = Math.floor((canvas.width - gw) / 2);
    graphics.fillStyle = "gray";
    if (xOff > 0) {
        graphics.fillRect(0, 0, xOff, canvas.height);
        graphics.fillRect(xOff + gw, 0, canvas.width - xOff - gw, canvas.height);
    }
    if (gh < canvas.height) graphics.fillRect(0, gh, canvas.width, canvas.height - gh);
}
function renderWorld() {
    var data = imgData.data, w = eng.world, n = eng.W * eng.H;
    for (var i = 0; i < n; i++) {
        var c = palette[w[i]], p = 4 * i;
        data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2]; data[p + 3] = 255;
    }
    offCtx.putImageData(imgData, 0, 0);
    var gw = eng.W * cellSize, gh = eng.H * cellSize;
    if (trailOn && eng.gen > 0) {
        graphics.fillStyle = "rgba(" + palette[0][0] + "," + palette[0][1] + "," + palette[0][2] + ",0.12)";
        graphics.fillRect(xOff, 0, gw, gh);
    }
    graphics.imageSmoothingEnabled = false;
    graphics.drawImage(offCanvas, xOff, 0, gw, gh);
    setSeedLine();
}
function paletteChanged() {
    clearBoard();
    renderWorld();
}

// ------------------------------------------------------- animation / actions
function frame() {
    if (running && !lambdaChanging) {
        ticksSinceLastGeneration++;
        if (ticksSinceLastGeneration >= ticksPerGeneration) {
            eng.stepGeneration();
            renderWorld();
            ticksSinceLastGeneration = 0;
            if (stopGeneration > 0 && eng.gen >= stopGeneration) doPause();
        }
    }
    if (running) requestAnimationFrame(frame);
}
function doRun() {
    if (running) return;
    running = true;
    stopGeneration = -1;
    ticksSinceLastGeneration = 0;
    $("run").disabled = true;
    $("step").disabled = true;
    $("pause").disabled = false;
    frame();
}
function doPause() {
    if (!running) return;
    running = false;
    $("run").disabled = false;
    $("step").disabled = false;
    $("pause").disabled = true;
}
function doStep() {
    if (running) return;
    eng.stepGeneration();
    renderWorld();
}
function doRunToScreen() {   // "Run 1000 Gens"
    if (!running) doRun();
    stopGeneration = eng.gen + 1000;
}
function doRestart() {
    eng.restart();
    clearBoard();
    renderWorld();
    setInfo();
}
function doNewWorld() {
    cellSize = Number($("cellsize").value);
    ticksPerGeneration = speedFor();
    fitWorld();
    eng.newWorld(Number($("worldtype").value));
    clearBoard();
    allocOff();
    renderWorld();
    setInfo();
}
function speedFor() {
    var ticks = Number($("speed").value);
    if (cellSize > 1) ticks = Math.min(120, Math.floor(ticks * cellSize / 2));
    return ticks;
}
function doChangeSpeed() {
    var t = speedFor();
    if (t != ticksPerGeneration) { ticksPerGeneration = t; ticksSinceLastGeneration = 0; }
}

// ------------------------------------------------------- rule set creation
function populateStatesSelect(cap, current) {
    var sel = $("states"), html = "";
    for (var s = 2; s <= Math.min(32, cap); s++) html += "<option>" + s + "</option>";
    sel.innerHTML = html;
    sel.value = "" + (current <= Math.min(32, cap) ? current : Math.min(32, cap));
}
function rebuildStatesSelect() {
    var cap = EO2D.maxStates($("shape").value, $("mode").value);
    var cur = Number($("states").value) || 4;
    populateStatesSelect(cap, cur);
    var statesCap = EO2D.maxStates($("shape").value, $("mode").value);
    if (currentTooBig()) $("states").value = "" + statesCap;
    function currentTooBig() { return cur > statesCap; }
}
function doNewRules(runAfter) {
    var wasRunning = running;
    if (running) doPause();
    var states = Number($("states").value);
    var shape = $("shape").value;
    var mode = $("mode").value;
    var cap = EO2D.maxStates(shape, mode);
    if (states > cap) { states = cap; populateStatesSelect(cap, states); }
    $("info").innerHTML = "building rule family&#8230;";
    setTimeout(function () {
        try {
            eng.configure(states, shape, mode);
            eng.newRuleFamily();
            fitWorld();
            eng.newWorld(Number($("worldtype").value));
            clearBoard();
            allocOff();
            renderWorld();
            setInfo();
            setRulesUsedField();
            lambdaSlider.setStep(0, 1 / eng.path.length);
            lambdaSlider.setValue(0, eng.rulesUsed / eng.path.length);
            if (wasRunning || runAfter) doRun();
        } catch (err) {
            $("info").innerHTML = "rule build failed: " + err.message;
        }
    }, 30);
}

// --------------------------------------------------------- lambda slider
function doChangeLambda() {
    var lambda = lambdaSlider.value(0);
    if (eng.rule) eng.setRulesUsed(lambda * eng.path.length);
    setRulesUsedField();
    setInfo();
    if (!lambdaChanging) doRestart();
}
function doStartLambdDrag() { lambdaChanging = true; }
function doEndLambdDrag() {
    lambdaChanging = false;
    doRestart();
}

// --------------------------------------------------- "rules in use" field
var rulesUsedTimeout = null;
function doKeyInRulesUsed(evt) {
    var code = evt.keyCode;
    if (code == 10 || code == 13 || code == 37 || code == 39) return;
    if ((code < 48 || code > 57) && code != 8) { evt.preventDefault(); return; }
    if (rulesUsedTimeout) clearTimeout(rulesUsedTimeout);
    rulesUsedTimeout = setTimeout(completeEnterRulesUsed, 1000);
}
function doChangeRulesUsed() {
    if (rulesUsedTimeout) { clearTimeout(rulesUsedTimeout); rulesUsedTimeout = null; completeEnterRulesUsed(); }
}
function completeEnterRulesUsed() {
    var val = Number($("rulesused").value.trim());
    if (isNaN(val) || val <= 0 || val > eng.path.length + 1) {
        $("info").innerHTML = "Error: Rules in use must be in range 1 to " + (eng.path.length + 1);
        return;
    }
    setInfo();
    if ((val - 1) != eng.rulesUsed) {
        lambdaSlider.setValue(0, (val - 1) / eng.path.length);
        eng.setRulesUsed(val - 1);
        doRestart();
    }
}

// ---------------------------------------------------------------- painting
function boardPos(evt) {
    var r = canvas.getBoundingClientRect();
    var scale = canvas.width / r.width;
    return [(evt.clientX - r.left) * scale, (evt.clientY - r.top) * scale];
}
function paintAt(evt, erase) {
    if (!eng.world || eng.world.length === 0) return;
    var pos = boardPos(evt);
    var cx = Math.floor((pos[0] - xOff) / cellSize);
    var cy = Math.floor(pos[1] / cellSize);
    eng.paintCell(cx, cy, erase ? 0 : brushState);
    renderWorld();
}
function installPaintHandlers(cv) {
    function start(evt) {
        if (eng.rule == null) return;
        eraseDrag = (evt.button === 2) || evt.shiftKey;
        painting = true;
        paintAt(evt, eraseDrag);
        if (evt.button === 2) evt.preventDefault();
    }
    function move(evt) { if (painting) { paintAt(evt, eraseDrag); evt.preventDefault(); } }
    function end() { painting = false; }
    cv.addEventListener("mousedown", start);
    cv.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    cv.addEventListener("mouseleave", end);
    cv.addEventListener("contextmenu", function (evt) { evt.preventDefault(); });
    cv.addEventListener("touchstart", function (evt) {
        if (eng.rule == null || evt.touches.length !== 1) return;
        evt.preventDefault();
        eraseDrag = false;
        painting = true;
        paintAt(evt.touches[0], false);
    }, { passive: false });
    cv.addEventListener("touchmove", function (evt) {
        if (!painting || evt.touches.length !== 1) return;
        evt.preventDefault();
        paintAt(evt.touches[0], false);
    }, { passive: false });
    cv.addEventListener("touchend", function () { painting = false; });
}
function populateBrush() {
    var sel = $("brush"), html = "";
    for (var s = 0; s < eng.states; s++)
        html += "<option value='" + s + "'>" + s + (s === 0 ? " (erase)" : "") + "</option>";
    sel.innerHTML = html;
    sel.value = "" + Math.min(brushState, eng.states - 1);
    brushState = Number(sel.value);
}

// --------------------------------------------- examples in localStorage
function populateExampleMenus() {
    localStorageItems = [];
    var data = null;
    try { data = localStorage.getItem(localStorageKey); } catch (e) {}
    if (data) { try { data = JSON.parse(data); } catch (e) { data = null; } }
    var selectList = "";
    if (data && data.length && data.length > 0) {
        data.sort(function (a, b) { return a[0] > b[0]; });
        for (var i = 0; i < data.length; i++)
            if (checkExampleData(data[i])) {
                localStorageItems.push(data[i]);
                selectList += "<option value='" + i + "'>" + data[i][0] + "</option>";
            }
    }
    if (localStorageItems.length == 0) {
        $("loadname").innerHTML = "<option>(None Available)</option>";
        $("loadname").disabled = true;
        $("deletename").innerHTML = "<option>(None Available)</option>";
        $("deletename").disabled = true;
    } else {
        $("loadname").innerHTML = selectList;
        $("loadname").disabled = false;
        $("deletename").innerHTML = selectList;
        $("deletename").disabled = false;
    }
    $("savename").value = "example " + (localStorageItems.length + 1);
}
// [name, ruleSeed, worldSeed, states, shape, mode, worldType, rulesUsed, cellSize, trail, ...palette]
function makeExampleData(name) {
    var data = [name, eng.ruleSeed, eng.worldSeed, eng.states, eng.shape, eng.mode,
                eng.worldType, eng.rulesUsed, cellSize, trailOn ? 1 : 0];
    for (var i = 0; i < palette.length; i++)
        if (palette[i][0] != DEFAULT_PALETTE[i][0] ||
            palette[i][1] != DEFAULT_PALETTE[i][1] || palette[i][2] != DEFAULT_PALETTE[i][2])
            data.push([i, palette[i][0], palette[i][1], palette[i][2]]);
    return data;
}
function checkExampleData(data) {
    // layout: [name, ruleSeed, worldSeed, states, shape, mode, worldType,
    //          rulesUsed, cellSize, trail, ...palette] -- shape (4) and mode
    // (5) are the string keys used by the select menus; 2026-11-11 fix:
    // the old "all of 1..9 must be numbers" check rejected every real save,
    // so saved examples passed doSave but never appeared in the load menu.
    try {
        if (!data.length || data.length < 10) return false;
        if (typeof data[0] != "string") return false;
        for (var i = 1; i <= 9; i++)
            if (typeof data[i] !== (i == 4 || i == 5 ? "string" : "number")) return false;
        if (data[3] < 2 || data[3] > 32) return false;
        if (!EO2D.SHAPES[data[4]]) return false;
        if (["asym", "d4", "permute"].indexOf(data[5]) < 0) return false;
        if (data[6] < 1 || data[6] > 9) return false;
        if (data[3] > EO2D.maxStates(data[4], data[5])) return false;
        if (data[8] < 1 || data[8] > 20) return false;
        return true;
    } catch (e) { return false; }
}
function applyExampleData(data) {
    cellSize = data[8];
    trailOn = !!data[9];
    $("trail").checked = trailOn;
    $("cellsize").value = "" + cellSize;
    $("shape").value = data[4];
    $("mode").value = data[5];
    populateStatesSelect(EO2D.maxStates(data[4], data[5]), data[3]);
    eng.configure(data[3], data[4], data[5]);
    eng.newRuleFamily(data[1]);
    fitWorld();
    eng.newWorld(data[6], data[2]);
    eng.setRulesUsed(data[7] >= 0 ? data[7] : Math.round(0.33 * eng.path.length));
    if (data.length > 10) {
        palette = [];
        for (var i = 0; i < eng.states; i++) palette.push(DEFAULT_PALETTE[i]);
        for (i = 10; i < data.length; i++) {
            var c = data[i][0];
            palette[c] = [data[i][1], data[i][2], data[i][3]];
        }
    } else {
        palette = DEFAULT_PALETTE;
    }
    clearBoard();
    allocOff();
    renderWorld();
    setInfo();
    setRulesUsedField();
    lambdaSlider.setStep(0, 1 / eng.path.length);
    lambdaSlider.setValue(0, eng.rulesUsed / eng.path.length);
    populateBrush();
}
function doSave() {
    var name = $("savename").value.trim();
    if (name == "") { alert("Please give the example a name."); return; }
    for (var i = 0; i < localStorageItems.length; i++)
        if (name == localStorageItems[i][0]) {
            alert("Error: Name is already used.\nTry a different name!");
            return;
        }
    localStorageItems.push(makeExampleData(name));
    try {
        localStorage.setItem(localStorageKey, JSON.stringify(localStorageItems));
    } catch (e) { alert("Could not save in browser storage: " + e.message); return; }
    populateExampleMenus();
    undoDeleteItem = null;
    $("undodelete").disabled = true;
}
function doLoad() {
    applyExampleData(localStorageItems[$("loadname").value]);
    doRun();
}
function doDelete() {
    var itemnum = Number($("deletename").value);
    undoDeleteItem = localStorageItems[itemnum];
    $("undodelete").disabled = false;
    localStorageItems.splice(itemnum, 1);
    localStorage.setItem(localStorageKey, JSON.stringify(localStorageItems));
    populateExampleMenus();
}
function doUndoDelete() {
    if (undoDeleteItem != null) {
        localStorageItems.push(undoDeleteItem);
        localStorage.setItem(localStorageKey, JSON.stringify(localStorageItems));
        populateExampleMenus();
        undoDeleteItem = null;
        $("undodelete").disabled = true;
    }
}
function doDeleteAll() {
    if (localStorageItems.length == 0) return;
    if (confirm("Do you really want to delete all saved examples?")) {
        undoDeleteItem = localStorageItems;
        $("undodelete").disabled = false;
        localStorageItems = [];
        localStorage.removeItem(localStorageKey);
        populateExampleMenus();
    }
}

// ------------------------------------------------------ file save / load
function setUpFileHandling() {
    var saveBtn = $("savebtn"), loadBtn = $("loadbtn");
    var loading = false;
    if (window.showOpenFilePicker && window.FileSystemFileHandle &&
        FileSystemFileHandle.prototype.getFile) {
        loadBtn.addEventListener("click", doLoadFile, false);
    } else {
        var chooser = document.createElement("input");
        chooser.type = "file";
        chooser.id = "chooseloadfile";
        chooser.style.display = "none";
        $("filebuttons").appendChild(chooser);
        loadBtn.addEventListener("click", doBasicLoadFile, false);
        loadBtn.title += "  This will look like uploading a file, but it will only be loaded locally.";
    }
    if (window.showSaveFilePicker && window.FileSystemFileHandle &&
        FileSystemFileHandle.prototype.createWritable) {
        saveBtn.addEventListener("click", doSaveFile, false);
    } else {
        saveBtn.addEventListener("click", doBasicSaveFile, false);
        saveBtn.title += "  This will look like downloading a file named edge-of-chaos-2d.json.";
    }
    function currentDataJSON() {
        var paletteInfo = [];
        for (var i = 0; i < palette.length; i++)
            if (palette[i][0] != DEFAULT_PALETTE[i][0] ||
                palette[i][1] != DEFAULT_PALETTE[i][1] || palette[i][2] != DEFAULT_PALETTE[i][2])
                paletteInfo.push([i, palette[i][0], palette[i][1], palette[i][2]]);
        return JSON.stringify({
            about_this_file: [
                "# Data for an example for the '2D Cellular Automata and the Edge of Chaos' web app",
                "# Rebuild it in the local copy of edge-of-chaos-2d (a 2D port of David Eck's app)"
            ],
            format: "edge-of-chaos-2d/1",
            ruleSeed: "" + eng.ruleSeed,
            worldSeed: "" + eng.worldSeed,
            states: "" + eng.states,
            shape: eng.shape,
            mode: eng.mode,
            worldType: "" + eng.worldType,
            rulesUsed: "" + eng.rulesUsed,
            cellSize: "" + cellSize,
            trail: trailOn ? "1" : "0",
            paletteInfo: paletteInfo
        }, null, 2);
    }
    function doSaveFile() {
        if (loading) return;
        var blob = new Blob([currentDataJSON()], { type: "text/json" });
        var options = { suggestedName: "edge-of-chaos-2d.json" };
        window.showSaveFilePicker(options).then(function (handle) {
            return handle.createWritable().then(function (stream) {
                return stream.write(blob).then(function () { return stream.close(); });
            });
        }).catch(function (e) {
            if (e.name !== "AbortError") alert("Error while attempting to save file:\n" + e.message);
        });
    }
    function doBasicSaveFile() {
        if (loading) return;
        var blob = new Blob([currentDataJSON()], { type: "text/json" });
        var link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "edge-of-chaos-2d.json";
        link.click();
        URL.revokeObjectURL(link.href);
    }
    function doBasicLoadFile() {
        var chooser = $("chooseloadfile");
        chooser.value = "";
        chooser.addEventListener("change", handleBasicLoad, false);
        chooser.click();
    }
    function handleBasicLoad() {
        var chooser = $("chooseloadfile");
        chooser.removeEventListener("change", handleBasicLoad, false);
        if (chooser.files.length === 0) return;
        chooser.files[0].text().then(function (text) { newData(text); })
            .catch(function (e) { alert("File load failed:\n" + e.message); });
    }
    function doLoadFile() {
        loading = true;
        loadBtn.disabled = true;
        window.showOpenFilePicker().then(function (files) {
            if (files.length === 0) return;
            return files[0].getFile().then(function (f) { return f.text(); })
                .then(function (text) { newData(text); });
        }).catch(function (e) {
            if (e.name !== "AbortError") alert("File load failed:\n" + e.message);
        }).finally(function () {
            loading = false;
            loadBtn.disabled = false;
        });
    }
    function newData(text) {
        var filedata;
        try {
            try { filedata = JSON.parse(text); }
            catch (e) { throw new Error("File content does not have legal JSON syntax."); }
            var data = [""];  // shape into makeExampleData order
            data[1] = checkValue("ruleSeed");
            data[2] = checkValue("worldSeed");
            data[3] = checkValue("states", 2, 32);
            data[4] = filedata.shape;
            if (!EO2D.SHAPES[data[4]]) throw new Error("unknown shape: " + data[4]);
            data[5] = filedata.mode;
            if (["asym", "d4", "permute"].indexOf(data[5]) < 0)
                throw new Error("unknown mode: " + data[5]);
            if (data[3] > EO2D.maxStates(data[4], data[5]))
                throw new Error("too many states for that shape/mode");
            data[6] = checkValue("worldType", 1, 9);
            data[7] = checkValue("rulesUsed");
            data[8] = checkValue("cellSize", 1, 20);
            data[9] = filedata.trail === "1" ? 1 : 0;
            var pal = filedata.paletteInfo;
            if (pal !== undefined) {
                // 2026-11-11 fix: an empty paletteInfo (the common case -- default
                // palette) is legal; the old `!pal.length` check rejected it, so
                // every saved file failed to load with "bad paletteInfo".
                if (!Array.isArray(pal)) throw new Error("bad paletteInfo");
                pal.forEach(function (color) {
                    if (typeof color !== "object" || color.length != 4)
                        throw new Error("bad value for paletteInfo");
                    var i = parseInt(color[0]), r = parseInt(color[1]),
                        g = parseInt(color[2]), b = parseInt(color[3]);
                    if (isNaN(i) || isNaN(r) || isNaN(g) || isNaN(b) ||
                        i < 0 || i >= 32 || r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255)
                        throw new Error("illegal color in paletteInfo");
                    data.push([i, r, g, b]);
                });
            }
            applyExampleData(data);
        } catch (e) {
            throw new Error("File is not valid: " + e.message);
        }
        function checkValue(name, min, max) {
            var value = filedata[name];
            if (value === undefined) throw new Error("missing value for " + name);
            value = parseInt(value);
            if (isNaN(value)) throw new Error("non-integral value for " + name);
            if (min !== undefined && (value < min || value > max))
                throw new Error("out of range value for " + name);
            return value;
        }
    }
}

// ------------------------------------------------------------ layout stuff
function adjustCanvas() {
    var holder = $("canvas-holder");
    var bounds = canvas.getBoundingClientRect();
    if (bounds.width > 0 && bounds.height > 0) {
        canvas.width = Math.max(50, Math.floor(bounds.width));
        canvas.height = Math.max(50, Math.floor(bounds.height));
    }
}
function adjustLayout() {
    var topH = $("board-top").getBoundingClientRect().height + 3;
    $("canvas-holder").style.top = topH + "px";
    var left = $("rulect").getBoundingClientRect().right + 4;
    var width = $("slidercanvasholder").getBoundingClientRect().right - left - 4;
    if (width > 80) {
        lambdaSlider.canvas.style.width = width + "px";
        lambdaSlider.canvas.width = width;
        lambdaSlider.draw();
    }
    // responsive: collapse controls behind the menu button on narrow windows
    if (window.innerWidth < 560) {
        $("controls").style.display = currentPopup === "controls" ? "block" : "none";
        $("menuicon").style.display = "inline";
        $("board").style.left = "6px";
    } else {
        $("controls").style.display = "block";
        $("menuicon").style.display = "none";
        $("board").style.left = "262px";
        doShowPopup("none");
    }
}
function doShowPopup(popup) {
    if (popup == currentPopup) return;
    $("mask").style.display = (popup === "none") ? "none" : "block";
    if (currentPopup === "controls") {
        $("controls").style.display = "none";
        $("menuicon").innerHTML = "&#9776;";
        document.removeEventListener("keydown", doKey, false);
    } else if (currentPopup === "colors") {
        hidePaletteEditor();
        document.removeEventListener("keydown", doKey, false);
    }
    currentPopup = popup;
    if (currentPopup === "controls") {
        $("menuicon").innerHTML = "&#10005;";
        $("controls").style.display = "block";
        document.addEventListener("keydown", doKey, false);
    } else if (currentPopup === "colors") {
        showPaletteEditor();
        document.addEventListener("keydown", doKey, false);
    }
}
function doKey(evt) {
    var code = evt.keyCode;
    if (currentPopup === "colors") {
        if (code == 13) acceptNewPalette();
        else if (code == 27) cancelNewPalette();
    } else if (currentPopup === "controls") {
        if (code == 27) doShowPopup("none");
    }
}

// --------------------------------------------------------------- resizing
function windowResized() {
    if (canvasTimeout != null) { clearTimeout(canvasTimeout); canvasTimeout = null; }
    doPause();
    adjustLayout();
    canvasTimeout = setTimeout(function () {
        adjustCanvas();
        var oldInitial = eng.initialWorld;
        fitWorld();
        eng.newWorld(Number($("worldtype").value));
        if (oldInitial) {
            var n = Math.min(oldInitial.length, eng.world.length);
            for (var i = 0; i < n; i++) eng.world[i] = oldInitial[i];
            eng.initialWorld = new Uint8Array(eng.world);
            eng.restart();
        }
        clearBoard();
        allocOff();
        renderWorld();
        doRun();
    }, 333);
}

// ------------------------------------------------------------ built-ins
function installBuiltInExampleFromURL() {
    var ex = window.location.search.match("^\\?ex=([0-9]+)");
    if (ex) {
        ex = Number(ex[1]);
        if (ex > 0 && ex <= builtInExample.length) {
            applyExampleData(builtInExample[ex - 1]);
            return true;
        }
    }
    return false;
}

// ------------------------------------------------------------------- init
function init() {
    try {
        canvas = $("canvas");
        graphics = canvas.getContext("2d", { willReadFrequently: true });
    } catch (e) {
        $("board").innerHTML = "Sorry, this page requires canvas support.";
        return;
    }
    offCanvas = document.createElement("canvas");
    offCtx = offCanvas.getContext("2d", { willReadFrequently: true });

    lambdaSlider = new SliderCanvas("slider-canvas");
    lambdaSlider.addSlider({ label: "lambda", min: 0.0, max: 1.0, value: 0.33, step: 0.0001, decimals: 4 });
    lambdaSlider.onChange = doChangeLambda;
    lambdaSlider.onDragStart = doStartLambdDrag;
    lambdaSlider.onDragEnd = doEndLambdDrag;
    lambdaSlider.draw();

    // control defaults: Moore 3x3, 4 states, D4 (the 2D echo of Eck's defaults)
    $("mode").value = "d4";
    $("shape").value = "m1";
    populateStatesSelect(EO2D.maxStates("m1", "d4"), 4);
    $("worldtype").value = "3";
    $("cellsize").value = "2";
    $("speed").value = "3";

    if (!window.localStorage) $("localstorage").style.display = "none";
    else {
        $("save").onclick = doSave;
        $("load").onclick = doLoad;
        $("delete").onclick = doDelete;
        $("undodelete").onclick = doUndoDelete;
        $("undodelete").disabled = true;
        $("deleteall").onclick = doDeleteAll;
        populateExampleMenus();
    }

    $("run").onclick = doRun;
    $("pause").onclick = doPause;
    $("step").onclick = doStep;
    $("runToScreen").onclick = doRunToScreen;
    $("restart").onclick = doRestart;
    $("newworld").onclick = doNewWorld;
    $("new").onclick = function () { doNewRules(false); };
    $("colors").onclick = function () { doShowPopup("colors"); };
    $("speed").onchange = doChangeSpeed;
    $("states").onchange = rebuildStatesSelect;
    $("shape").onchange = rebuildStatesSelect;
    $("mode").onchange = rebuildStatesSelect;
    $("brush").onchange = function () { brushState = Number(this.value); };
    $("trail").onchange = function () {
        trailOn = this.checked;
        clearBoard();
        renderWorld();
    };
    $("rulesused").onkeydown = doKeyInRulesUsed;
    $("rulesused").onblur = doChangeRulesUsed;
    $("rulesused").onchange = doChangeRulesUsed;
    $("mask").onclick = function () { doShowPopup("none"); };
    $("menuicon").onclick = function () {
        doShowPopup(currentPopup === "controls" ? "none" : "controls");
    };
    window.onresize = windowResized;
    setUpFileHandling();
    installPaintHandlers(canvas);

    adjustLayout();
    adjustCanvas();
    cellSize = Number($("cellsize").value);
    ticksPerGeneration = speedFor();
    populateBrush();

    if (!installBuiltInExampleFromURL()) {
        doNewRules(true);
    } else {
        doRun();
    }
}

window.onload = init;
