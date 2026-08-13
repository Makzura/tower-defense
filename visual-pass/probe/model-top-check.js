// RAW TOP PER MODEL -- the discriminator between two builds that are identical
// in triangle count, frame count, group names and palette.
//
// enemy-shielded build A reports 1.274 and build B reports 1.354. File size and
// triangle count cannot tell them apart, so any completed run that did not
// record this cannot say retroactively which model it measured. This does.
"use strict";
var fs=require("fs"),path=require("path"),os=require("os");
var cdp=require("./cdp"),serve=require("./serve");
var PORT=8804,DEVTOOLS=9344;
var NAMES=process.argv.slice(2);
if(!NAMES.length) NAMES=["enemy-shielded","enemy-armored","enemy-normal"];
(async function(){
  var server=await new Promise(function(r,j){serve.start(PORT,function(e,s){e?j(e):r(s);});});
  var chrome=cdp.launch(DEVTOOLS,path.join(os.tmpdir(),"td-probe-mtop"));
  await cdp.waitForDevTools(DEVTOOLS);
  var conn=await cdp.open(DEVTOOLS,"http://127.0.0.1:"+PORT+"/TD_0.5.0/index.html");
  var S=conn.session;
  try{
    for(var i=0;i<80;i++){ if(await S.evaluate("typeof startRun==='function' && typeof World3D!=='undefined'"))break; await cdp.sleep(250);}
    await S.evaluate(fs.readFileSync(path.join(__dirname,"page-probe.js"),"utf8"));
    await S.evaluate("TDProbe.setup()"); await S.evaluate("TDProbe.warm(2)");
    var out=JSON.parse(await S.evaluate("JSON.stringify("+
      JSON.stringify(NAMES)+".map(function(n){var m=GLModels.get(World3D.renderer(),n);"+
      " if(!m) return {name:n,missing:true};"+
      " return {name:n, rawTop:+m.top.toFixed(4), unitsToPx:m.unitsToPx,"+
      "         frames:m.frames.length, groups:m.groups.map(function(g){return g.name;}),"+
      "         triangles:(m.gpu&&m.gpu.count)?m.gpu.count/3:null};}))"));
    console.log(JSON.stringify(out,null,1));
  } finally {
    try{await S.send("Browser.close");}catch(e){} try{chrome.kill();}catch(e){} server.close();
  }
})().catch(function(e){console.error("MODEL TOP CHECK FAILED: "+e.stack);process.exit(1);});
