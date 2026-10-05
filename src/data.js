export const SEED = {
  tasks: [
    {id:'t1',title:'Desayuno y rutina de la mañana',date:'2026-10-04',time:'08:00',completed:true,estimatedMinutes:45},
    {id:'t2',title:'Clases',date:'2026-10-04',time:'09:00',completed:true,estimatedMinutes:150},
    {id:'t3',title:'Estudiar Estadística',date:'2026-10-04',time:'11:30',priority:'alta',completed:false,estimatedMinutes:90},
    {id:'t4',title:'Almuerzo',date:'2026-10-04',time:'14:00',completed:false},
    {id:'t5',title:'Revisar proyecto',date:'2026-10-04',time:'15:00',priority:'media',completed:false,estimatedMinutes:60},
    {id:'t6',title:'Entrenamiento',date:'2026-10-04',time:'18:00',completed:false,estimatedMinutes:75},
    {id:'t7',title:'Cenar',date:'2026-10-04',time:'21:00',completed:true},
    {id:'t8',title:'Lectura',date:'2026-10-04',time:'22:30',completed:true,estimatedMinutes:25},
    {id:'t9',title:'Dormir',date:'2026-10-04',time:'23:30',completed:false},
    {id:'t10',title:'Comprar alimentos',date:'',completed:false,createdAt:'2026-10-01'},
    {id:'t11',title:'Revisar GitHub',date:'',completed:false,createdAt:'2026-10-02'},
    {id:'t12',title:'Ordenar habitación',date:'',completed:false,createdAt:'2026-10-03'},
    {id:'t13',title:'Responder mensaje',date:'',completed:false,createdAt:'2026-10-04'}
  ],
  nonNegotiables: [
    {id:'n1',icon:'💧',name:'Agua',target:'2 L',active:true,frequency:'daily',days:[1,2,3,4,5,6,0]},
    {id:'n2',icon:'🏋️',name:'Entrenamiento',target:'4 / semana',active:true,frequency:'weekly',days:[1,3,5,6]},
    {id:'n3',icon:'📚',name:'Estudiar',target:'2 h',active:true,frequency:'daily',days:[1,2,3,4,5,6,0]},
    {id:'n4',icon:'🌙',name:'Dormir',target:'7–8 h',active:true,frequency:'daily',days:[1,2,3,4,5,6,0]},
    {id:'n5',icon:'🍎',name:'Alimentación consciente',target:'Diario',active:true,frequency:'daily',days:[1,2,3,4,5,6,0],checks:{'2026-10-04':true}},
    {id:'n6',icon:'❤️',name:'Cuidado personal',target:'Diario',active:true,frequency:'daily',days:[1,2,3,4,5,6,0],checks:{}}
  ],
  habits: [
    {id:'h1',name:'Leer',days:{'2026-10-04':true,'2026-10-02':true,'2026-10-01':true}},
    {id:'h2',name:'10k pasos',days:{'2026-10-04':true,'2026-10-01':true}},
    {id:'h3',name:'Meditar',days:{'2026-10-04':true,'2026-10-02':true}},
    {id:'h4',name:'Inglés',days:{'2026-10-03':true,'2026-10-02':true}},
    {id:'h5',name:'No dormir tarde',days:{'2026-10-03':true,'2026-10-01':true}}
  ],
  priorities: [
    {id:'p1',title:'Estudiar Estadística',progress:60,relatedTaskIds:['t3']},
    {id:'p2',title:'Entrenar',progress:100,relatedTaskIds:['t6']},
    {id:'p3',title:'Avanzar proyecto personal',progress:40,relatedTaskIds:['t5']}
  ],
  training: [
    {id:'tr1',title:'Entrenamiento 1',date:'2026-09-28',time:'19:00',durationMinutes:90,completed:true,type:'Fuerza'},
    {id:'tr2',title:'Entrenamiento 2',date:'2026-09-30',time:'19:00',durationMinutes:85,completed:true,type:'Fuerza'},
    {id:'tr3',title:'Entrenamiento 3',date:'2026-10-04',time:'19:00',durationMinutes:80,completed:false,type:'Fuerza'},
    {id:'tr4',title:'Entrenamiento 4',date:'2026-10-03',time:'10:00',durationMinutes:75,completed:true,type:'Cardio'}
  ],
  goals: [
    {id:'g1',icon:'🎓',category:'Estudios',title:'Aprobar Estadística',progress:70,linkedPriorityIds:['p1'],linkedTaskIds:['t3'],linkedHabitIds:['h4']},
    {id:'g2',icon:'🏋️',category:'Fitness',title:'Entrenar 4 veces por semana',progress:100,linkedPriorityIds:['p2'],linkedTaskIds:['t6'],linkedHabitIds:[]},
    {id:'g3',icon:'💻',category:'Proyecto',title:'Publicar aplicación',progress:40,linkedPriorityIds:['p3'],linkedTaskIds:['t5'],linkedHabitIds:[]}
  ],
  days: {
    '2026-10-04': {mood:'Bien',energy:7,studyMinutes:90,sleepMinutes:440,waterLiters:1.5,weight:76.6,steps:8200,reflection:{achieved:'Terminé las clases y avancé en el trabajo.',improve:'Dormir más temprano.',notes:'Recordar revisar el capítulo 3.'},minimalPlan:{study:true,water:true,training:false,sleep:false}}
  },
  weekly: {
    '2026-09-28': {achieved:'Completé 4 entrenamientos.',improve:'Ser más constante con el estudio.',win:'Mantuve el hábito de entrenar.'}
  },
  settings:{waterGoal:2,studyGoalMinutes:120,sleepGoalMinutes:480}
}

export function deepClone(v){return JSON.parse(JSON.stringify(v))}
