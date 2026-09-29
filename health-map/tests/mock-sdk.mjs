export function createMockSdk() {
  const state = { maps:[],markers:[],editors:[],calls:[],searchStatus:'complete',searchResult:{poiList:{pois:[{id:'poi1',name:'测试资源',address:'测试地址',location:{lng:121.5017,lat:31.285}}]}},walkingStatus:'complete',walkingResult:{routes:[{distance:240,time:180,steps:[{path:[[121.5016,31.2848],[121.502,31.285]]},{path:[[121.502,31.285],[121.5025,31.2853]]}]}]} };
  class Events { listeners = {}; on(type,fn){(this.listeners[type] ||= new Set()).add(fn);} off(type,fn){this.listeners[type]?.delete(fn);} emit(type,event){this.listeners[type]?.forEach(fn => fn(event));} }
  class Map extends Events {
    constructor(container,options){super();this.options=options;this.container=container;this.overlays=new Set();state.maps.push(this);setTimeout(()=>this.emit('complete'),5);}
    add(items){for(const o of Array.isArray(items)?items:[items])this.overlays.add(o);}
    remove(items){for(const o of Array.isArray(items)?items:[items])this.overlays.delete(o);}
    addControl(){} resize(){} setZoomAndCenter(...args){this.camera=args;} setBounds(...args){this.camera=args;} zoomIn(){} zoomOut(){}
    destroy(){this.destroyed=true;this.overlays.clear();this.listeners={};}
    click(p){this.emit('click',{lnglat:{lng:p[0],lat:p[1]}});}
  }
  class Marker extends Events { constructor(options){super();this.options=options;state.markers.push(this);} }
  class Polyline extends Events { constructor(options){super();this.path=options.path;this.options=options;} getPath(){return this.path;} setPath(path){this.path=path;} }
  class PolylineEditor extends Events { constructor(map,line){super();this.line=line;state.editors.push(this);} open(){this.opened=true;} close(){this.closed=true;} }
  class PlaceSearch { constructor(options){this.options=options;} searchNearBy(query,center,radius,callback){state.calls.push({service:'search',query,center,radius,options:this.options});queueMicrotask(()=>callback(state.searchStatus,state.searchResult));} }
  class Walking { search(start,end,callback){state.calls.push({service:'walking',start,end});queueMicrotask(()=>callback(state.walkingStatus,state.walkingResult));} }
  class TileLayer {} TileLayer.Satellite = class {}; TileLayer.RoadNet = class {};
  return {state,sdk:{Map,Marker,Polyline,PolylineEditor,PlaceSearch,Walking,TileLayer,Scale:class {},Bounds:class {constructor(sw,ne){this.sw=sw;this.ne=ne;}}}};
}
