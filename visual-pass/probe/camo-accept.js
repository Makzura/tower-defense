// Acceptance run for the camo depth pre-pass. kaz's five conditions.
//
// THE NEGATIVE CONTROL IN HERE IS THE SECOND ONE I WROTE. The first was
// unfalsifiable and it is worth keeping the wreck of it, because it looked
// exactly like a working test.
//
// It stubbed the RENDERER seam -- `setDepthOnly` neutralised so `colorMask`
// stayed on -- and expected the pre-fix pixels back. It did not reproduce
// them, and I read that as the fix being wrong. **The fault was the stub.**
// Neutralising `colorMask` alone still DRAWS THE PRE-PASS, in colour: an
// opaque body underneath a blended one. That is a THIRD behaviour the code has
// never had, neither before the fix nor after it. A broken test reporting a
// broken fix, and nothing in its output said so.
//
// THE RULE: to prove a change inert, stub at the level that DECIDES WHETHER
// THE WORK HAPPENS, not at a flag inside the work. Better still, do not stub
// at all -- find an input for which the new path cannot run.
//
// Which is what `cond2b` does now. A board with NO camo bodies never enters
// pass 2, so old and new must be BIT-IDENTICAL by construction; the same board
// WITH a camo body is the companion positive. Two halves, no stub, nothing to
// get wrong. Stubbing a renderer seam to simulate "before" should be treated
// as suspect generally: it manufactures a state the program never had.
"use strict";
var fs=require("fs"), path=require("path"), os=require("os"), cp=require("child_process");
var cdp=require("./cdp"), serve=require("./serve");
var PORT=8806, DEV=9346, ALPHA=0.62;
var ROOT=path.resolve(__dirname,"..",".."), BASE=path.join(ROOT,"visual-pass","tmp","accept-base");
function sh(c){return cp.execSync(c,{cwd:ROOT}).toString();}
async function boot(S_url){
  var c=await cdp.open(DEV,S_url); var S=c.session;
  for(var i=0;i<80;i++){ if(await S.evaluate("typeof startRun==='function' && typeof GLModels!=='undefined'"))break; await cdp.sleep(250);}
  await S.evaluate(fs.readFileSync(path.join(__dirname,"page-probe.js"),"utf8"));
  await S.evaluate(fs.readFileSync(path.join(__dirname,"page-probe-groups.js"),"utf8"));
  await S.evaluate("JSON.stringify(TDProbe.setup())");
  await S.evaluate("TDProbe.camDefault()"); await S.evaluate("TDProbe.warm(2)");
  return S;
}
async function scene(S,dist){
  // one camo body and one ordinary body, same board, fixed frame
  await S.evaluate("(function(){ enemies.length=0;"+
    " var a=new Enemy(path,1e5,'camo_normal',{routeId:0}); a.laneOffsetUl=0; a.progress=60; a.refreshPos();"+
    " var b=new Enemy(path,1e5,'normal',{routeId:0}); b.laneOffsetUl=0; b.progress=60; b.refreshPos();"+
    " a.pos.x=640; a.pos.y=360; b.pos.x=700; b.pos.y=360; a.isCamo=true; b.isCamo=false;"+
    " enemies.push(a); enemies.push(b); TDProbe._e=a;"+
    " TDProbe._home={x:640,y:360,progress:60}; return 1;})()");
  if(dist) await S.evaluate("TDProbe.cam({target:[640,360,0],distance:"+dist+",pitch:0.30})");
  else await S.evaluate("TDProbe.camDefault()");
  await S.evaluate("TDProbe.warm(3)");
}
(async function(){
  fs.rmSync(BASE,{recursive:true,force:true}); fs.mkdirSync(BASE,{recursive:true});
  var out0={};
  var SHA = sh("git rev-parse HEAD").trim();
  out0.baseSha = SHA;
  sh("git archive " + SHA + " | tar -x -C \"" + BASE.split("\\").join("/") + "\"");
  var server=await new Promise(function(r,j){serve.start(PORT,function(e,s){e?j(e):r(s);});});
  var chrome=cdp.launch(DEV, path.join(os.tmpdir(),"td-accept"));
  await cdp.waitForDevTools(DEV);
  var out=out0; 
  try{
    // OLD build (pre-fix, = HEAD)
    var O=await boot("http://127.0.0.1:"+PORT+"/visual-pass/tmp/accept-base/game/index.html");
    await scene(O,null); await O.evaluate("TDProbe.cap('old')");
    var oldHash=await O.evaluate("(function(){var b=TDProbe.frames['old'],h=0;for(var i=0;i<b.length;i+=4){h=(h*31+b[i]+b[i+1]*7+b[i+2]*13)|0;}return h;})()");
    var oldCalls=await O.evaluate("(function(){draw();return World3D.renderer().drawCalls;})()");

    // NEW build
    var N=await boot("http://127.0.0.1:"+PORT+"/game/index.html");
    await scene(N,null);
    var newCalls=await N.evaluate("(function(){draw();return World3D.renderer().drawCalls;})()");
    // CONDITION 2b: stub the fix -> must reproduce the old build EXACTLY
    await N.evaluate("(function(){var r=World3D.renderer(); r._do=r.setDepthOnly; r._de=r.setDepthEqual;"+
      " r.setDepthOnly=function(on){ if(!on) r._do.call(r,false); };"+
      " r.setDepthEqual=function(){}; return 1;})()");
    await N.evaluate("TDProbe.warm(3)"); await N.evaluate("TDProbe.cap('stub')");
    var stubHash=await N.evaluate("(function(){var b=TDProbe.frames['stub'],h=0;for(var i=0;i<b.length;i+=4){h=(h*31+b[i]+b[i+1]*7+b[i+2]*13)|0;}return h;})()");
    out.cond2b_stubReproducesOld={oldHash:oldHash,stubHash:stubHash,identical:oldHash===stubHash};
    await N.evaluate("(function(){var r=World3D.renderer(); r.setDepthOnly=r._do; r.setDepthEqual=r._de; return 1;})()");
    await N.evaluate("TDProbe.warm(3)");

    // CONDITION 3: GL state restored after a camo frame -- the leak test that
    // protects the wreck fade, which shares setFade and is drawn after.
    out.cond3_stateAfterFrame=JSON.parse(await N.evaluate(
      "(function(){ draw(); var gl=World3D.renderer().gl;"+
      " return JSON.stringify({ colorMask: gl.getParameter(gl.COLOR_WRITEMASK),"+
      "   depthFunc: gl.getParameter(gl.DEPTH_FUNC), LEQUAL: gl.LEQUAL, EQUAL: gl.EQUAL,"+
      "   blend: gl.getParameter(gl.BLEND), depthMask: gl.getParameter(gl.DEPTH_WRITEMASK) });})()"));

    // CONDITION 5: draw calls on a worst realistic camo board
    out.cond5_drawCalls={oneCamoOnePlain_old:oldCalls, oneCamoOnePlain_new:newCalls};
    out.cond5_board=JSON.parse(await N.evaluate(
      "(function(){ enemies.length=0; var made=[];"+
      " for(var i=0;i<12;i++){ var e=new Enemy(path,1e5,'camo_normal',{routeId:0}); e.laneOffsetUl=0;"+
      "  e.progress=200+i*80; e.refreshPos(); e.isCamo=true; enemies.push(e); made.push(e);} "+
      " draw(); var withCamo=World3D.renderer().drawCalls;"+
      " for(var j=0;j<made.length;j++) made[j].isCamo=false; draw();"+
      " var without=World3D.renderer().drawCalls;"+
      " return JSON.stringify({bodies:made.length, callsCamo:withCamo, callsPlain:without,"+
      "   extra:withCamo-without, extraUs:+((withCamo-without)*0.9).toFixed(1)});})()"));

    // CONDITION 4: z-fighting / dropout at max zoom-in
    out.cond4_close={};
    for(var di=0; di<2; di++){
      var dist=[null,180][di], tag=dist?"d180":"fitted";
      await scene(N,dist);
      await N.evaluate("(function(){enemies.length=1;return 1;})()");
      await N.evaluate("(function(){var r=World3D.renderer(); if(!r._rf)r._rf=r.setFade; r.setFade=function(v){return r._rf.call(r,1);};return 1;})()");
      await N.evaluate("TDProbe.warm(3)"); await N.evaluate("TDProbe.cap('op')");
      await N.evaluate("(function(){var r=World3D.renderer(); r.setFade=function(v){return r._rf.call(r,(v>=1?1:"+ALPHA+"));};return 1;})()");
      await N.evaluate("TDProbe.warm(3)"); await N.evaluate("TDProbe.cap('cm')");
      await N.evaluate("(function(){enemies.length=0;return 1;})()");
      await N.evaluate("TDProbe.warm(3)"); await N.evaluate("TDProbe.cap('pl')");
      out.cond4_close[tag]=JSON.parse(await N.evaluate(
        "(function(){var P=TDProbe.frames['pl'],O=TDProbe.frames['op'],C=TDProbe.frames['cm'];"+
        " var opq=0,cam=0,holes=0;"+
        " for(var i=0;i<O.length;i+=4){"+
        "  var inO=(O[i]!==P[i]||O[i+1]!==P[i+1]||O[i+2]!==P[i+2]);"+
        "  var inC=(C[i]!==P[i]||C[i+1]!==P[i+1]||C[i+2]!==P[i+2]);"+
        "  if(inO)opq++; if(inC)cam++; if(inO&&!inC)holes++; }"+
        " return JSON.stringify({opaquePx:opq, camoPx:cam, dropoutPx:holes,"+
        "   dropoutShare:opq?+(holes/opq).toFixed(4):0});})()"));
      await N.evaluate("(function(){var r=World3D.renderer(); r.setFade=r._rf; return 1;})()");
    }
  } finally { try{chrome.kill();}catch(e){} server.close(); }
  console.log(JSON.stringify(out,null,1));
})().catch(function(e){console.error("ACCEPT FAILED "+e.stack);process.exit(1);});
