var fs = require("fs"), path = require("path");
var ROOT = require("path").resolve(__dirname, "..", "..", "jeu");
global.window = global;
function load(p){ (0,eval)(fs.readFileSync(path.join(ROOT,p),"utf8")); }
var models = {};
global.GLModels = { register: function(n,d){ models[n]=d; } };
var name = process.argv[2];
load("js/gl/gl-parts.js");
load("js/gl/models/"+name+".js");
var d = models[name];
var tris = d.triangles;
var pos = new Float32Array(d.positions);
var groups = d.groups && d.groups.length ? d.groups : [{name:"",first:0,count:tris*3}];
var count = groups[0].count;

// Re-run the exact classifier, but report per component.
var GE = /var GROUND_EPS = ([-0-9.]+);/.exec(
  fs.readFileSync(path.join(ROOT,"js/gl/gl-parts.js"),"utf8"))[1];
var spec = global.GLParts.volumes[name];
if (!spec) { console.log(name+": no spec"); process.exit(0); }

var parent = new Int32Array(count); for (var i=0;i<count;i++) parent[i]=i;
function find(a){ while(parent[a]!==a){ parent[a]=parent[parent[a]]; a=parent[a]; } return a; }
function union(a,b){ a=find(a); b=find(b); if(a!==b) parent[b]=a; }
var seen = Object.create(null);
for (i=0;i<count;i++){
  var p=i*3, k=Math.round(pos[p]*1e4)+"|"+Math.round(pos[p+1]*1e4)+"|"+Math.round(pos[p+2]*1e4);
  if (seen[k]===undefined) seen[k]=i; else union(i,seen[k]);
}
for (i=0;i+2<count;i+=3){ union(i,i+1); union(i,i+2); }
var comp = Object.create(null);
for (var t=0;t*3<count;t++){
  var r=find(t*3), c=comp[r];
  if(!c) c=comp[r]={n:0,sx:0,sy:0,sz:0,minZ:1e9,x0:1e9,x1:-1e9,y0:1e9,y1:-1e9,z1:-1e9,tris:0};
  c.tris++;
  for (var v=0;v<3;v++){ var q=(t*3+v)*3;
    c.sx+=pos[q]; c.sy+=pos[q+1]; c.sz+=pos[q+2]; c.n++;
    if(pos[q+2]<c.minZ) c.minZ=pos[q+2];
    if(pos[q]<c.x0)c.x0=pos[q]; if(pos[q]>c.x1)c.x1=pos[q];
    if(pos[q+1]<c.y0)c.y0=pos[q+1]; if(pos[q+1]>c.y1)c.y1=pos[q+1];
    if(pos[q+2]>c.z1)c.z1=pos[q+2];
  }
}
function inCyl(x,y,z,v){ if(z<v.z0||z>v.z1) return false; var dx=x-v.x,dy=y-v.y; return dx*dx+dy*dy<=v.r*v.r; }
function inCap(x,y,z,v){ var ax=v.bx-v.ax,ay=v.by-v.ay,az=v.bz-v.az,px=x-v.ax,py=y-v.ay,pz=z-v.az;
  var l=ax*ax+ay*ay+az*az,t=l>0?(px*ax+py*ay+pz*az)/l:0; if(t<0)t=0; if(t>1)t=1;
  var dx=px-ax*t,dy=py-ay*t,dz=pz-az*t; return dx*dx+dy*dy+dz*dz<=v.r*v.r; }
console.log("== "+name+"  (GROUND_EPS="+GE+")");
var totalFixed=0;
Object.keys(comp).forEach(function(k){
  var c=comp[k], cx=c.sx/c.n, cy=c.sy/c.n, cz=c.sz/c.n;
  var grounded = c.minZ >= Number(GE);
  var hit=false;
  (spec.cyl||[]).forEach(function(v,idx){ if(inCyl(cx,cy,cz,v)) hit="cyl"+idx; });
  (spec.box||[]).forEach(function(v,idx){ if(cx>=v.x0&&cx<=v.x1&&cy>=v.y0&&cy<=v.y1&&cz>=v.z0&&cz<=v.z1) hit=hit||("box"+idx); });
  (spec.cap||[]).forEach(function(v,idx){ if(inCap(cx,cy,cz,v)) hit=hit||"cap"+idx; });
  if (hit && grounded) { totalFixed+=c.tris;
    if (c.tris >= 60 || (c.x1-c.x0)>0.3)
      console.log("  FIXED "+String(hit).padEnd(6)+" tris="+String(c.tris).padStart(5)+
        " x["+c.x0.toFixed(2)+","+c.x1.toFixed(2)+"] y["+c.y0.toFixed(2)+","+c.y1.toFixed(2)+
        "] z["+c.minZ.toFixed(2)+","+c.z1.toFixed(2)+"]");
  }
});
console.log("  total fixed tris = "+totalFixed);
