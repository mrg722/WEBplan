import {SEED,deepClone} from './data.js'
const KEY='plan20-data-v1'
export function load(){try{const raw=localStorage.getItem(KEY); return raw?JSON.parse(raw):deepClone(SEED)}catch{return deepClone(SEED)}}
export function save(data){localStorage.setItem(KEY,JSON.stringify(data))}
export function reset(){localStorage.removeItem(KEY);location.reload()}
export function ensureDay(data,key){if(!data.days[key]) data.days[key]={mood:'',energy:7,studyMinutes:0,sleepMinutes:0,waterLiters:0,weight:'',steps:'',reflection:{achieved:'',improve:'',notes:''},minimalPlan:{study:false,water:false,training:false,sleep:false}}; return data.days[key]}
