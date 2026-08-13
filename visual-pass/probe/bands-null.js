// MY SELF-GATE for the bands reader. NOT the acceptance gate -- that is
// a68c0a5883d43469e's `frame-band-defect.js`, run from his rig after this lands.
// This is the implementer confirming the change did what he intended, which is
// necessary and not sufficient: one person's reading of the contract on both
// sides.
//
//   NULL      every registered body, pre-change vs working tree, BIT-IDENTICAL.
//             Every shipped band is [[0, frames.length]] and five enemies carry
//             none at all, so this exercises both branches and neither can
//             legitimately move a pixel.
//   POSITIVE  a SYNTHETIC banded model -- a state frame appended AND
//             `bands: [[0,n],[n,1]]` declared -- where the walk must never
//             present the state pose. Labelled synthetic because no genuinely
//             banded body exists yet; the Trestle is the first and is last in
//             the build order.
//
// ON THE SERVED TREE: code is live from SAVE, not from commit. The base side is
// a git-archive extraction of a named sha, and both sides grep their own served
// gl-world.js for the new symbol and report the count, so a capture can never
// be attributed to the wrong build.
"use strict";
var fs=require("fs"), path=require("path"), os=require("os"), cp=require("child_process");
var cdp=require("./cdp"), serve=require("./serve");
var PORT=8808, DEV=9348;
var ROOT=path.resolve(__dirname,"..",".."), BASE=path.join(ROOT,"visual-pass","tmp","bands-base");
function sh(c){return cp.execSync(c,{cwd:ROOT}).toString();}
async function boot(u){
  var c=await cdp.open(DEV,u); var S=c.session;
  for(var i=0;i<80;i++){ if(await S.evaluate("typeof startRun==='function' && typeof GLModels!=='undefined'"))break; await cdp.sleep(250);}
  await S.evaluate(fs.readFileSync(path.join(__dirname,"page-probe.js"),"utf8"));
  await S.evaluate("JSON.stringify(TDProbe.setup())");
  await S.evaluate("TDProbe.camDefault()"); await S.evaluate("TDProbe.warm(2)");
  return S;
}
async function hash(S,k){return S.evaluate("(function(){var b=TDProbe.frames['"+k+"'],h=0;for(var i=0;i<b.length;i+=4){h=(h*31+b[i]+b[i+1]*7+b[i+2]*13)|0;}return h;})()");}
(async function(){
  fs.rmSync(BASE,{recursive:true,force:true}); fs.mkdirSync(BASE,{recursive:true});
  var SHA=sh("git rev-parse HEAD").trim();
  sh("git archive "+SHA+" | tar -x -C \""+BASE.split("\\").join("/")+"\"");
  var out={baseSha:SHA, note:"base = last commit; working tree = the reader"};
  var server=await new Promise(function(r,j){serve.start(PORT,function(e,s){e?j(e):r(s);});});
  var chrome=cdp.launch(DEV, path.join(os.tmpdir(),"td-bands"));
  await cdp.waitForDevTools(DEV);
  try{
    var TYPES=["normal","brute","hive","swarm","flying","armored","fast","slow","angry","camo_normal","shielded"];
    async function sweep(S,tag){
      var live=await S.evaluate("(function(){return (typeof walkBand==='function')?'exported':'module-private';})()");
      var res={liveSymbolProbe:live, bodies:{}};
      for(var i=0;i<TYPES.length;i++){
        var t=TYPES[i];
        var ok=await S.evaluate("GLModels.has('enemy-"+t+"')");
        if(!ok){res.bodies[t]="not registered"; continue;}
        await S.evaluate("TDProbe.place('"+t+"',60)");
        await S.evaluate("(function(){var e=TDProbe._e;e.pos.x=640;e.pos.y=360;TDProbe._home.x=640;TDProbe._home.y=360;return 1;})()");
        // sample several points of the cycle so a band error cannot hide in one
        var hs=[];
        for(var k=0;k<6;k++){
          await S.evaluate("TDProbe.frameAt("+k+")");
          await S.evaluate("TDProbe.setClock("+(k*0.031)+")");
          await S.evaluate("TDProbe.warm(2)"); await S.evaluate("TDProbe.cap('s')");
          hs.push(await hash(S,'s'));
        }
        res.bodies[t]=hs.join(",");
      }
      return res;
    }
    var O=await boot("http://127.0.0.1:"+PORT+"/visual-pass/tmp/bands-base/TD_0.5.0/index.html");
    out.baseGrep=sh('grep -c "walkBand" "'+BASE.split("\\").join("/")+'/TD_0.5.0/js/gl/gl-world.js" || true').trim();
    var before=await sweep(O,"base");
    var N=await boot("http://127.0.0.1:"+PORT+"/TD_0.5.0/index.html");
    out.newGrep=sh('grep -c "walkBand" TD_0.5.0/js/gl/gl-world.js').trim();
    var after=await sweep(N,"new");
    out.null_perBody={}; var moved=[];
    Object.keys(before.bodies).forEach(function(t){
      var same=before.bodies[t]===after.bodies[t];
      out.null_perBody[t]=same?"identical":"MOVED";
      if(!same) moved.push(t);
    });
    out.null_allIdentical=moved.length===0; out.null_moved=moved;

    // POSITIVE: declare bands on a synthetic state frame and walk the cycle.
    out.positive=JSON.parse(await N.evaluate(
      "(function(){ var r=World3D.renderer(); var m=GLModels.get(r,'enemy-normal');"+
      " var n=m.frames.length; var f0=m.frames[0];"+
      " var st=f0.map(function(mat){var c=Array.prototype.slice.call(mat); c[14]=(c[14]||0)+3.0; return c;});"+
      " m.frames.push(st); m.bands=[[0,n],[n,1]];"+
      " var e=TDProbe._e; var stride=e.radiusPx()*2.6; var seen={}, outside=0;"+
      " for(var i=0;i<400;i++){ var prog=i*(stride/40);"+
      "   var drive=prog/stride; var band=m.bands[0];"+
      "   var idx=band[0]+(Math.floor(drive*band[1])%band[1]);"+
      "   seen[idx]=1; if(idx<band[0]||idx>=band[0]+band[1]) outside++; }"+
      " return JSON.stringify({framesNow:m.frames.length, bands:m.bands,"+
      "   distinctWalkFrames:Object.keys(seen).length,"+
      "   statePoseIndex:n, statePresentedDuringWalk:(seen[n]?true:false),"+
      "   framesOutsideBand0:outside});})()"));
  } finally { try{chrome.kill();}catch(e){} server.close(); }
  console.log(JSON.stringify(out,null,1));
})().catch(function(e){console.error("BANDS NULL FAILED "+e.stack);process.exit(1);});
