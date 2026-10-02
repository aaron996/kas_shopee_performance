import { House, ChartNoAxesColumnIncreasing, LayoutDashboard, Layers, ArrowRightLeft, Clock, Sparkles, ShieldAlert, Search, PanelLeftOpen, PanelLeftClose, Sun, Moon, Maximize2, Minimize2, Download, Check, RefreshCw, MessageSquareText, Info, ChevronRight, ChevronDown, ArrowRight, ArrowUpRight, SlidersHorizontal, X, Rows3, AlignJustify, ChevronsUpDown, ChevronsDownUp, Copy, CalendarDays, MapPin, Warehouse, Filter, RotateCcw, CircleHelp, ArrowRightToLine, Settings2, Bell, Truck, UserRound, UsersRound } from 'lucide';
const esc = value => String(value).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
export const icons={House,ChartNoAxesColumnIncreasing,LayoutDashboard,Layers,ArrowRightLeft,Clock,Sparkles,ShieldAlert,Search,PanelLeftOpen,PanelLeftClose,Sun,Moon,Maximize2,Minimize2,Download,Check,RefreshCw,MessageSquareText,Info,ChevronRight,ChevronDown,ArrowRight,ArrowUpRight,SlidersHorizontal,X,Rows3,AlignJustify,ChevronsUpDown,ChevronsDownUp,Copy,CalendarDays,MapPin,Warehouse,Filter,RotateCcw,CircleHelp,ArrowRightToLine,Settings2,Bell,Truck,UserRound,UsersRound};

// Motion B: multipart hover choreography; Morphicons remains the state-change engine.
const reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionRuns=new WeakMap();
const easeOut='cubic-bezier(0.23,1,0.32,1)';
function animatePart(el,frames,options={}){
 if(!el||reduceMotion())return;
 return el.animate(frames,{duration:280,easing:easeOut,...options});
}
export function beginIconHover(target){
 const el=target?.querySelector('.animated-icon');
 if(!el||target.disabled||el.dataset.hovered==='true'||reduceMotion())return;
 el.dataset.hovered='true';playIcon(el);
}
export function endIconHover(target){
 const el=target?.querySelector('.animated-icon');if(!el)return;
 el.dataset.hovered='false';(motionRuns.get(el)||[]).forEach(a=>a.cancel());
}
function playIcon(el){
 const svg=el.querySelector('.motion-svg');if(!svg)return;const parts=[...svg.children],name=el.dataset.motion;
 (motionRuns.get(el)||[]).forEach(a=>a.cancel());let runs=[];
 const run=(part,frames,options)=>{const a=animatePart(part,frames,options);if(a)runs.push(a);};
 const bounce=(part,transform,delay=0)=>run(part,[{transform:'none'},{transform,offset:.55},{transform:'none'}],{delay,duration:280});
 if(name==='ChartNoAxesColumnIncreasing')parts.forEach((p,i)=>run(p,[{transform:'scaleY(1)'},{transform:'scaleY(.35)',offset:.25},{transform:'scaleY(1)',offset:.85},{transform:'scaleY(1)'}],{delay:i*120,duration:1000,easing:'ease-in-out'}));
 else if(name==='LayoutDashboard')parts.forEach((p,i)=>run(p,[{transform:'none'},{transform:'translateY(-3px)',offset:.4},{transform:'translateY(-3px)',offset:.58},{transform:'none'}],{delay:i*80,duration:1000,easing:'ease-in-out'}));
 else if(name==='ArrowRightLeft')parts.forEach((p,i)=>bounce(p,`translateX(${i%2?-3:3}px)`));
 else if(name==='Clock'){
 // One minute sweep advances the hour hand by 1/12 of a turn, around the same pivot.
 run(svg.querySelector('[data-part="minute"]'),[{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:1800,easing:'linear',fill:'forwards'});
 run(svg.querySelector('[data-part="hour"]'),[{transform:'rotate(0deg)'},{transform:'rotate(30deg)'}],{duration:1800,easing:'linear',fill:'forwards'});
 }
 else if(name==='Sparkles'){
 // Each sparkle owns its centre; the two crossed strokes share a single group.
 parts.forEach((p,i)=>run(p,[{transform:'scale(1)',opacity:1},{transform:'scale(.75)',opacity:.35,offset:.22},{transform:'scale(1.2)',opacity:1,offset:.62},{transform:'scale(1)',opacity:1}],{duration:1000,delay:i*160,easing:'ease-in-out'}));
 }
 else if(name==='ShieldAlert'){
 run(parts[0],[{transform:'rotate(0deg)'},{transform:'rotate(-5deg)',offset:.22},{transform:'rotate(4deg)',offset:.48},{transform:'rotate(0deg)',offset:.75},{transform:'rotate(0deg)'}],{duration:1100,easing:'ease-in-out'});
 const mark=svg.querySelector('[data-part="alert"]');
 run(mark,[{opacity:1,transform:'translateY(0)'},{opacity:.25,transform:'translateY(-1.5px)',offset:.2},{opacity:1,transform:'translateY(0) scale(1.18)',offset:.48},{opacity:1,transform:'none',offset:.72},{opacity:1,transform:'none'}],{duration:1100,easing:'ease-in-out'});
 run(svg.querySelector('[data-part="alert-halo"]'),[{opacity:0,transform:'scale(.7)'},{opacity:.25,transform:'scale(1)',offset:.35},{opacity:0,transform:'scale(1.3)'}],{duration:1100,easing:'ease-out'});
 }
 else if(name==='Moon'){
 run(svg.querySelector('[data-part="moon"]'),[{transform:'rotate(0deg)'},{transform:'rotate(-18deg)',offset:.35},{transform:'rotate(5deg)',offset:.7},{transform:'rotate(0deg)'}],{duration:1200,easing:'ease-in-out'});
 svg.querySelectorAll('[data-part="star"]').forEach((p,i)=>run(p,[{opacity:0,transform:'scale(.7)'},{opacity:1,transform:'scale(1)',offset:.4},{opacity:1,transform:'scale(1)',offset:.6},{opacity:0,transform:'scale(.7)'}],{duration:900,delay:140+i*180,easing:'ease-in-out'}));
 }
 else if(name==='PanelLeftOpen'||name==='PanelLeftClose'){
 const dir=name==='PanelLeftOpen'?1:-1;
 run(svg.querySelector('[data-part="divider"]'),[{transform:'translateX(0)'},{transform:`translateX(${dir*3}px)`,offset:.4},{transform:`translateX(${dir*3}px)`,offset:.62},{transform:'translateX(0)'}],{duration:1100,easing:'ease-in-out'});
 run(svg.querySelector('[data-part="arrow"]'),[{transform:'translateX(0)'},{transform:`translateX(${dir*2}px)`,offset:.4},{transform:`translateX(${dir*2}px)`,offset:.62},{transform:'translateX(0)'}],{duration:1100,easing:'ease-in-out'});
 run(svg.querySelector('[data-part="panel-fill"]'),[{opacity:.04},{opacity:.24,offset:.4},{opacity:.24,offset:.62},{opacity:.04}],{duration:1100,easing:'ease-in-out'});
 }
 else if(name==='Search'){run(svg,[{transform:'translateX(0)'},{transform:'translateX(-3px)',offset:.3},{transform:'translateX(3px)',offset:.7},{transform:'translateX(0)'}]);}
 else if(name==='Download'){bounce(parts[0],'translateY(3px)');bounce(parts[2],'translateY(3px)');bounce(parts[1],'scaleX(1.12)',50);}
 else if(name==='RefreshCw')run(svg,[{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:1100,easing:'ease-in-out'});
 else if(name==='MapPin'){
 run(parts[0],[{transform:'none'},{transform:'translateY(-2px) rotate(-10deg)',offset:.3},{transform:'rotate(7deg)',offset:.65},{transform:'none'}],{duration:1200,easing:'ease-in-out'});
 run(parts[1],[{transform:'scale(1)'},{transform:'scale(.55)',offset:.3},{transform:'scale(1.2)',offset:.65},{transform:'scale(1)'}],{duration:1200,easing:'ease-in-out'});
 }
 else if(name==='UsersRound'){
 run(svg.querySelector('[data-part="person-front"]'),[{transform:'none'},{transform:'translateX(-1.5px) rotate(-6deg)',offset:.4},{transform:'none'}],{duration:1200,easing:'ease-in-out'});
 run(svg.querySelector('[data-part="person-back"]'),[{transform:'none'},{transform:'translateX(1.5px) rotate(6deg)',offset:.4},{transform:'none'}],{duration:1100,delay:100,easing:'ease-in-out'});
 }
 else if(name==='Warehouse')run(svg.querySelector('[data-part="door"]'),[{transform:'scaleY(1)'},{transform:'scaleY(.2)',offset:.4},{transform:'scaleY(.2)',offset:.6},{transform:'scaleY(1)'}],{duration:1200,easing:'ease-in-out'});
 else if(name==='RotateCcw')run(svg,[{transform:'rotate(0deg)'},{transform:'rotate(180deg)'}]);
 else if(name==='Bell')run(svg,[{transform:'rotate(0)'},{transform:'rotate(-14deg)',offset:.25},{transform:'rotate(12deg)',offset:.6},{transform:'rotate(0)'}]);
 else if(name==='SlidersHorizontal')parts.forEach((p,i)=>bounce(p,`translateX(${i%2?2:-2}px)`));
 else if(name==='Copy')parts.forEach((p,i)=>bounce(p,`translate(${i?2:-2}px,${i?2:-2}px)`));
 else if(name==='Maximize2'||name==='Minimize2')parts.forEach((p,i)=>bounce(p,`translate(${i%2?2:-2}px,${i<2?-2:2}px)`));
 else if(name.startsWith('Arrow')||name.startsWith('Chevron'))bounce(svg,name==='ArrowUpRight'?'translate(2px,-2px)':'translateX(2px)');
 else if(name==='MessageSquareText'){bounce(parts[0],'translateY(-2px)');parts.slice(1).forEach((p,i)=>run(p,[{opacity:1},{opacity:.2,offset:.3},{opacity:1}],{delay:i*40}));}
 else if(name==='Sun'){
 run(svg.querySelector('[data-part="rays"]'),[{transform:'rotate(0deg)'},{transform:'rotate(45deg)'}],{duration:1200,easing:'ease-in-out'});
 run(svg.querySelector('[data-part="sun"]'),[{transform:'scale(1)'},{transform:'scale(.8)',offset:.25},{transform:'scale(1.12)',offset:.6},{transform:'scale(1)'}],{duration:1200,easing:'ease-in-out'});
 }
 else bounce(svg,'scale(1.15)');
 motionRuns.set(el,runs);
}
export function iconSvg(name,size){
 const shape=([tag,attrs])=>`<${tag} ${Object.entries(attrs).map(([k,v])=>`${k}="${esc(v)}"`).join(' ')}></${tag}>`;
 const nodes=icons[name];let content=nodes.map(shape).join('');
 if(name==='Clock')content=`${shape(nodes[0])}<path data-part="minute" d="M12 12V6"/><path data-part="hour" d="M12 12l4 2"/><circle cx="12" cy="12" r=".65" fill="currentColor" stroke="none"/>`;
 else if(name==='UsersRound')content=`<g data-part="person-front" class="local-pivot">${shape(nodes[0])}${shape(nodes[1])}</g><g data-part="person-back" class="local-pivot">${shape(nodes[2])}</g>`;
 else if(name==='Warehouse')content=`${shape(nodes[0])}${shape(nodes[1])}<g data-part="door" style="transform-origin:12px 10px">${shape(nodes[2])}${shape(nodes[3])}</g>`;
 else if(name==='Sparkles')content=`<g class="local-pivot">${shape(nodes[0])}</g><g class="local-pivot">${shape(nodes[1])}${shape(nodes[2])}</g><g class="local-pivot">${shape(nodes[3])}</g>`;
 else if(name==='ShieldAlert')content=`${shape(nodes[0])}<circle data-part="alert-halo" cx="12" cy="12" r="5.5" fill="currentColor" stroke="none" opacity="0"/><g data-part="alert">${nodes.slice(1).map(shape).join('')}</g>`;
 else if(name==='Moon')content=`<g data-part="moon">${content}</g><path data-part="star" class="local-pivot" d="M18 3v4m-2-2h4" opacity="0"/><circle data-part="star" class="local-pivot" cx="21" cy="9" r=".7" opacity="0" fill="currentColor" stroke="none"/>`;
 else if(name==='Sun')content=`<g data-part="sun">${shape(nodes[0])}</g><g data-part="rays">${nodes.slice(1).map(shape).join('')}</g>`;
 else if(name==='PanelLeftOpen'||name==='PanelLeftClose')content=`${shape(nodes[0])}<rect data-part="panel-fill" x="4" y="4" width="4" height="16" rx=".5" fill="currentColor" stroke="none" opacity=".04"/><g data-part="divider">${shape(nodes[1])}</g><g data-part="arrow">${shape(nodes[2])}</g>`;
 return `<svg class="motion-svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
}
