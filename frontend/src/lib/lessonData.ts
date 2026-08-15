// Central database of all lessons and their exercises.
// Curriculum order: Greetings → Verb To Be → Present Continuous → Present Simple → Past Simple → Future
// Week 1 lives here; the full Week 2–5 content is authored in ./lessonContent.
// Month 2+ content (Modals, Questions, Vocabulary, …) lives in ./monthContent.
import { WEEK_2_5 } from './lessonContent'
import { MONTH_2, MONTH_2_SEQUENCE, MONTH_3, MONTH_3_SEQUENCE } from './monthContent'
import { MONTH_4, MONTH_4_SEQUENCE } from './month4Content'
import { MONTH_5, MONTH_5_SEQUENCE } from './month5Content'
import { MONTH_6, MONTH_6_SEQUENCE } from './month6Content'
import { MONTH_7, MONTH_7_SEQUENCE } from './month7Content'
import { MONTH_8, MONTH_8_SEQUENCE } from './month8Content'
import { MONTH_9, MONTH_9_SEQUENCE } from './month9Content'
import { MONTH_10, MONTH_10_SEQUENCE } from './month10Content'
import { MONTH_11, MONTH_11_SEQUENCE } from './month11Content'
import { MONTH_12, MONTH_12_SEQUENCE } from './month12Content'
import type { PlanType } from '../types'
import { planUnlockCount } from './plans'

export interface Ex {
  id: number
  type: 'multiple_choice' | 'translation' | 'fill_blank' | 'write'
  question: string
  options: string[]
  answer: string
  /** For `write` exercises: extra spellings/phrasings accepted as correct,
   *  besides `answer`. Matching is case-, spacing- and hyphen-insensitive. */
  accept?: string[]
  explanation: string
  xp: number
}

export interface LessonSection {
  type?: 'intro' | 'tip' | 'examples'
  title: string
  content?: string
  examples?: { full: string; contraction?: string; translation?: string }[]
  sentences?: string[]
}

export interface LessonDef {
  id: string
  title: string
  week: number
  day: number
  level: string
  xp: number
  duration: string
  topic: string
  /** Calendar month (1–12) this lesson belongs to. Optional on hand-written
   *  lessons - when absent it is derived from the lesson's position in
   *  LESSON_SEQUENCE via getLessonsByMonth(). New content sets it explicitly. */
  month?: number
  sections: LessonSection[]
  stage1: Ex[]
  stage2: Ex[]
  stage3: Ex[]
}

// ─── W1D1 - Greetings & Sentence Building ─────────────────────────────────────
const GREET: LessonDef = {
  id: 'w1d1', title: 'Greetings & Sentence Building', week: 1, day: 1, level: 'A1', xp: 40, duration: '10 min', topic: 'Communication',
  sections: [
    { type: 'intro', title: '📖 Sentence Structure',
      content: 'Every English conversation follows 4 steps: Greeting → Question → Content → Farewell. Learn this and you can talk to anyone!',
      examples: [
        { full: '1. GREETING - Say hello',         contraction: 'Hi! / Hello! / Hey! / Good morning!' },
        { full: '2. QUESTION - Show interest',     contraction: "How are you? / How's it going?" },
        { full: '3. CONTENT - Share something',    contraction: "I'm fine. / I'm great! / I'm a bit tired." },
        { full: '4. FAREWELL - Say goodbye',       contraction: 'Bye! / See you later! / Take care!' },
      ] },
    { type: 'tip', title: '💡 Key Phrases',
      content: "These are the most useful phrases in English. You will use them EVERY DAY. Say them out loud 3 times each!" },
    { type: 'examples', title: '🗣️ A Real Conversation', sentences: [
      'A: "Hi Ana! How are you?" B: "I\'m great, thanks! And you?"',
      'A: "I\'m good too! I just finished work." B: "Excellent! See you tomorrow!"',
      "REMEMBER: Always respond to 'How are you?' - silence is considered rude!",
    ]},
  ],
  stage1: [
    { id:1,  type:'multiple_choice', question:"What is the FIRST step in an English conversation?", options:['Greeting','Farewell','Content','Question'], answer:'Greeting', explanation:"Always start with a greeting: Hi! Hello! Good morning!", xp:10 },
    { id:2,  type:'write', question:"Translate: 'Olá!'", options:[], answer:'Hello!', explanation:"'Olá' = Hello / Hi - the most basic greeting.", xp:10 },
    { id:3,  type:'multiple_choice', question:"'Como estás?' in English:", options:['How are you?','Who are you?','Where are you?','What are you?'], answer:'How are you?', explanation:"'Como estás?' = 'How are you?' - the most common question after a greeting.", xp:10 },
    { id:4,  type:'fill_blank', question:"'I'm ___, thanks!' - correct response to 'How are you?'", options:['fine','good','great','all are correct'], answer:'all are correct', explanation:"Fine, good, and great are all correct! Use 'great' when you're very happy.", xp:15 },
    { id:5,  type:'multiple_choice', question:"'Bom dia!' in English:", options:['Good morning!','Good night!','Good afternoon!','Good evening!'], answer:'Good morning!', explanation:"'Bom dia' = 'Good morning' - used until about 12pm.", xp:10 },
    { id:6,  type:'translation', question:"Translate: 'Até logo!'", options:['See you later!','Good morning!','How are you?','I am fine.'], answer:'See you later!', explanation:"'Até logo' = 'See you later' - a casual farewell.", xp:10 },
    { id:7,  type:'multiple_choice', question:"'Boa tarde!' in English:", options:['Good afternoon!','Good morning!','Good night!','Good evening!'], answer:'Good afternoon!', explanation:"'Boa tarde' = 'Good afternoon' - used from 12pm to about 6pm.", xp:10 },
    { id:8,  type:'fill_blank', question:"Complete: '___ you!' - a casual farewell", options:['See','Bye','Thank','both "See you!" and "Bye!" work'], answer:'both "See you!" and "Bye!" work', explanation:"'See you!' and 'Bye!' are both natural casual farewells.", xp:15 },
    { id:9,  type:'write', question:"Translate: 'Cuida-te!'", options:[], answer:'Take care!', explanation:"'Cuida-te' = 'Take care' - a warm farewell.", xp:10 },
    { id:10, type:'multiple_choice', question:"Which is NOT a greeting?", options:['Goodbye!','Hello!','Hi!','Hey!'], answer:'Goodbye!', explanation:"'Goodbye' is a farewell (step 4), not a greeting (step 1).", xp:15 },
  ],
  stage2: [
    { id:11, type:'multiple_choice', question:"'How do you do?' is:", options:['A formal British greeting when meeting someone new','The same as "How are you?"','A question about your job','A casual American greeting'], answer:'A formal British greeting when meeting someone new', explanation:"'How do you do?' is very formal British English for first meetings. The response is 'How do you do?' (you repeat it!).", xp:15 },
    { id:12, type:'translation', question:"Translate: 'E tu? Como estás?'", options:['And you? How are you?','And me? How am I?','What about you? Fine?','How about you?'], answer:'And you? How are you?', explanation:"'E tu?' = 'And you?' - always ask back after answering 'How are you?'", xp:15 },
    { id:13, type:'fill_blank', question:"'Good ___, how are you?' - meeting at 8pm", options:['evening','night','afternoon','morning'], answer:'evening', explanation:"Good evening = boa noite (when greeting). 'Good night' is used only to say GOODBYE at bedtime.", xp:20 },
    { id:14, type:'multiple_choice', question:"'How's it going?' means:", options:['How are you? (casual)','Where are you going?','What is happening?','How did it go?'], answer:'How are you? (casual)', explanation:"'How's it going?' = casual version of 'How are you?' Very common in American English.", xp:15 },
    { id:15, type:'write', question:"Translate: 'Não estou muito bem.'", options:[], answer:"I'm not very well.", accept:["i am not very well."], explanation:"'Não estou muito bem' = 'I'm not very well' - the polite way to say you don't feel well.", xp:15 },
    { id:16, type:'multiple_choice', question:"Casual response to 'How are you?':", options:['Not bad, thanks!','I am well, thank you very much.','Fine.','All of the above work'], answer:'All of the above work', explanation:"All are correct! 'Not bad' is very natural and common.", xp:20 },
    { id:17, type:'fill_blank', question:"'It was ___ to meet you!' - farewell at end of a meeting", options:['nice','great','lovely','all are correct'], answer:'all are correct', explanation:"'Nice/Great/Lovely to meet you!' - all three are natural farewells after meeting someone.", xp:20 },
    { id:18, type:'write', question:"Translate: 'Tenha uma boa semana!'", options:[], answer:'Have a good week!', explanation:"'Tenha uma boa semana' = 'Have a good week!' - a warm farewell.", xp:15 },
    { id:19, type:'multiple_choice', question:"'Pleasure to meet you!' - when do you say this?", options:['When meeting someone for the first time','When saying hello to a friend','When leaving a party','When thanking someone'], answer:'When meeting someone for the first time', explanation:"'(It's a) pleasure to meet you!' = prazer em conhecê-lo/a - first meeting only.", xp:15 },
    { id:20, type:'translation', question:"Translate: 'Até amanhã!'", options:['See you tomorrow!','Until tomorrow.','Goodbye tomorrow.','Both first and second are correct.'], answer:'Both first and second are correct.', explanation:"'Até amanhã' = 'See you tomorrow!' or 'Until tomorrow.' - both natural.", xp:20 },
  ],
  stage3: [
    { id:21, type:'multiple_choice', question:"'Cheers!' in British English can mean:", options:['Thank you AND goodbye (informal)','Only goodbye','Only thank you','You\'re welcome'], answer:'Thank you AND goodbye (informal)', explanation:"'Cheers!' in British English = 'thanks!' or 'bye!' (informal). In American English, it's mainly used when toasting.", xp:25 },
    { id:22, type:'translation', question:"Translate naturally: 'Como é que as coisas estão contigo?'", options:['How are things with you?','How\'s everything going?','Both are correct natural translations.','What is it like with you?'], answer:'Both are correct natural translations.', explanation:"Both 'How are things with you?' and 'How's everything going?' are natural equivalents.", xp:25 },
    { id:23, type:'fill_blank', question:"Email opening: 'I hope ___ finds you well.'", options:['this','this email','this message','both "this" and "this email" are correct'], answer:'both "this" and "this email" are correct', explanation:"'I hope this (email) finds you well' = Espero que esteja bem - formal email greeting.", xp:30 },
    { id:24, type:'multiple_choice', question:"'Long time no see!' means:", options:["It's been a long time since we last met","I haven't seen you today","You look different","I miss you"], answer:"It's been a long time since we last met", explanation:"'Long time no see!' = 'Há muito tempo que não nos víamos!' - used when meeting after a long absence.", xp:25 },
    { id:25, type:'translation', question:"Translate: 'Com licença, pode repetir por favor?'", options:['Excuse me, could you repeat that please?','Sorry, what did you say?','Both are natural translations.','I beg your pardon?'], answer:'Both are natural translations.', explanation:"All are correct! 'I beg your pardon?' is very formal British English.", xp:25 },
    { id:26, type:'multiple_choice', question:"'TTYL' in digital communication means:", options:['Talk to you later','Text to your location','Thanks to your list','Time to your language'], answer:'Talk to you later', explanation:"'TTYL' = 'Talk to you later' - modern digital farewell. Others: 'GTG' (got to go), 'BRB' (be right back).", xp:25 },
    { id:27, type:'write', question:"Formal email closing: 'I look forward to ___ from you.'", options:[], answer:'hearing', explanation:"'I look forward to hearing from you' - gerund after 'look forward to'. Most common formal email closing.", xp:30 },
    { id:28, type:'translation', question:"Translate: 'Foi um prazer fazer negócios consigo.'", options:["It's been a pleasure doing business with you.","I enjoyed working with you.","Both express the idea naturally.","Business with you was pleasurable."], answer:"Both express the idea naturally.", explanation:"'It's been a pleasure doing business with you' is the formal version. 'I enjoyed working with you' is simpler.", xp:30 },
    { id:29, type:'multiple_choice', question:"'Mind how you go!' is a British farewell meaning:", options:['Be careful / take care','Watch where you walk','Have a good trip','All of the above'], answer:'Be careful / take care', explanation:"'Mind how you go!' = British way of saying 'take care'. Very warm and common.", xp:25 },
    { id:30, type:'translation', question:"Translate the full micro-conversation: 'A: Olá João, há tanto tempo! Como tens passado? B: Muito bem, obrigado! E tu? A: Também bem. Até logo!'", options:["A: Hi João, long time no see! How have you been? B: Very well, thank you! And you? A: Good too. See you later!","A: Hello João, it's been a while! How are you doing? B: Really well, thanks! How about you? A: Same here. Bye!","Both are natural English translations.","Neither is correct."], answer:'Both are natural English translations.', explanation:"Both translations are completely natural English - different words, same meaning. That's the beauty of fluency!", xp:35 },
  ],
}

// ─── W1D2 - Verb To Be Present ────────────────────────────────────────────────
const VTB1: LessonDef = {
  id: 'w1d2', title: 'Verb To Be - Present', week: 1, day: 2, level: 'A1', xp: 50, duration: '12 min', topic: 'Grammar',
  sections: [
    { type: 'intro', title: '📖 Grammar', content: 'The verb "To Be" is the most important verb in English. It expresses existence, states, and identity.',
      examples: [
        { full: 'I am a student.' }, { full: 'You are from Angola.' }, { full: 'He is a doctor.' },
        { full: 'She is happy.' }, { full: 'It is cold.' }, { full: 'We are friends.' }, { full: 'They are teachers.' },
      ] },
    { type: 'tip', title: '💡 Tip', content: 'Remember: "am" is ONLY for "I". "is" is for he/she/it. "are" is for you/we/they.' },
    { type: 'examples', title: '🗣️ Real Examples', sentences: [
      "I am Ana. I am from Luanda.", "He is my brother. He is 25 years old.", "We are students at university.",
    ]},
  ],
  stage1: [
    { id:1, type:'multiple_choice', question:"Choose the correct form: 'I ___ a student.'", options:['am','is','are','be'], answer:'am', explanation:"'I am' - 'am' is only used with 'I'.", xp:10 },
    { id:2, type:'multiple_choice', question:"Choose: 'He ___ a doctor.'", options:['is','am','are','be'], answer:'is', explanation:"'He is' - use 'is' for he/she/it.", xp:10 },
    { id:3, type:'write', question:"Translate: 'Nós somos amigos.'", options:[], answer:'We are friends.', accept:["we're friends."], explanation:"'We are' - use 'are' for we/you/they.", xp:10 },
    { id:4, type:'fill_blank', question:"Complete: 'She ___ a teacher and they ___ students.'", options:['is / are','are / is','am / are','is / am'], answer:'is / are', explanation:"She → is. They → are.", xp:15 },
    { id:5, type:'multiple_choice', question:"Which is CORRECT?", options:['It are cold today.','It am cold today.','It is cold today.','It be cold today.'], answer:'It is cold today.', explanation:"'It is' - 'it' uses 'is'.", xp:10 },
    { id:6, type:'translation', question:"Translate: 'Tu és de Portugal.'", options:['You are from Portugal.','You is from Portugal.','You am from Portugal.','Your are from Portugal.'], answer:'You are from Portugal.', explanation:"'You are' - 'you' always uses 'are'.", xp:10 },
    { id:7, type:'multiple_choice', question:"'They ___ my friends.' - correct form?", options:['are','is','am','be'], answer:'are', explanation:"They → are.", xp:10 },
    { id:8, type:'fill_blank', question:"'___ you from Brazil? Yes, I ___.'", options:['Are / am','Is / am','Am / are','Are / are'], answer:'Are / am', explanation:"Question: Are you...? Answer: Yes, I am.", xp:15 },
    { id:9, type:'write', question:"Translate: 'Ele é médico.'", options:[], answer:'He is a doctor.', accept:["he's a doctor."], explanation:"'He is' - note: English needs 'a doctor' but Portuguese doesn't need the article.", xp:10 },
    { id:10, type:'multiple_choice', question:"Which sentence is WRONG?", options:['I am happy.','She is my teacher.','We are students.','They is from Angola.'], answer:'They is from Angola.', explanation:"'They' uses 'are' - 'They ARE from Angola.'", xp:15 },
  ],
  stage2: [
    { id:11, type:'multiple_choice', question:"'Is' or 'Are'? - 'There ___ many students in the class.'", options:['are','is','am','be'], answer:'are', explanation:"'There are' - use 'are' because 'students' is plural.", xp:15 },
    { id:12, type:'write', question:"Translate: 'Ela está cansada.'", options:[], answer:'She is tired.', accept:["she's tired."], explanation:"'Is' for states and conditions with he/she/it.", xp:15 },
    { id:13, type:'fill_blank', question:"'The children ___ at school and the teacher ___ in the class.'", options:['are / is','is / are','am / is','are / are'], answer:'are / is', explanation:"Children (plural) → are. Teacher (singular) → is.", xp:20 },
    { id:14, type:'multiple_choice', question:"What is the negative of 'She is a doctor'?", options:['She is not a doctor.','She not is a doctor.','She is no a doctor.','Not she is a doctor.'], answer:'She is not a doctor.', explanation:"Negative: subject + is/am/are + NOT + rest.", xp:15 },
    { id:15, type:'translation', question:"Translate: 'Nós não somos de Angola.'", options:['We are not from Angola.','We not are from Angola.','We are no from Angola.','Us are not from Angola.'], answer:'We are not from Angola.', explanation:"'We are not' - place 'not' after the verb 'to be'.", xp:15 },
    { id:16, type:'multiple_choice', question:"Question form: 'He is a student.' → ?", options:['Is he a student?','He is a student?','Is a student he?','Does he is a student?'], answer:'Is he a student?', explanation:"Yes/No questions: invert the verb - Is/Am/Are + subject.", xp:15 },
    { id:17, type:'fill_blank', question:"'___ she at home? No, she ___ not.'", options:['Is / is','Are / are','Am / is','Is / are'], answer:'Is / is', explanation:"'Is she...? No, she is not.' - consistent use of 'is'.", xp:20 },
    { id:18, type:'write', question:"Translate: 'Quantos anos tens?'", options:[], answer:'How old are you?', explanation:"Age in English uses 'to be': How old ARE you? I AM 25.", xp:15 },
    { id:19, type:'multiple_choice', question:"'It ___ raining.' - correct?", options:['is','are','am','be'], answer:'is', explanation:"'It is raining' - weather always uses 'it is'.", xp:15 },
    { id:20, type:'multiple_choice', question:"'You ___ always on time.' - fill the blank.", options:['are','is','am','be'], answer:'are', explanation:"'You are' - even for one person, 'you' always uses 'are'.", xp:15 },
  ],
  stage3: [
    { id:21, type:'multiple_choice', question:"'To be or not to be' - what grammatical form is 'to be'?", options:['Infinitive','Past','Present','Gerund'], answer:'Infinitive', explanation:"'To be' is the infinitive form - the base/dictionary form of the verb.", xp:25 },
    { id:22, type:'fill_blank', question:"'I ___ born in 1995. My parents ___ born in 1965.'", options:['was / were','am / are','were / was','be / were'], answer:'was / were', explanation:"Past of 'to be': I WAS, he/she/it WAS, we/you/they WERE.", xp:25 },
    { id:23, type:'write', question:"Translate: 'Seja o que for.'", options:[], answer:'Whatever it may be.', explanation:"Subjunctive: 'may be' expresses uncertainty/generality.", xp:30 },
    { id:24, type:'multiple_choice', question:"'She has been sick.' - what tense is 'has been'?", options:['Present Perfect','Past Simple','Future Perfect','Present Continuous'], answer:'Present Perfect', explanation:"'Has been' = Present Perfect of 'to be' - action started in the past, still relevant now.", xp:25 },
    { id:25, type:'multiple_choice', question:"Which uses 'to be' as an AUXILIARY verb?", options:['She is working.','She is a teacher.','She is happy.','She is from Brazil.'], answer:'She is working.', explanation:"'Is working' = is + -ing → 'to be' as auxiliary for Present Continuous.", xp:25 },
    { id:26, type:'translation', question:"Translate: 'Se eu fosse tu, ficaria calado.'", options:["If I were you, I'd stay quiet.","If I was you, I would stay quiet.","Were I you, I will stay quiet.","If I am you, I'd stay quiet."], answer:"If I were you, I'd stay quiet.", explanation:"Subjunctive: 'If I WERE you' - formal/literary English uses 'were' for all persons.", xp:30 },
    { id:27, type:'fill_blank', question:"'The meeting ___ being held tomorrow.' - correct form?", options:['is','are','am','be'], answer:'is', explanation:"'The meeting IS being held' - passive with Present Continuous.", xp:25 },
    { id:28, type:'multiple_choice', question:"'Being honest is important.' - what is 'being'?", options:['Gerund','Participle','Infinitive','Auxiliary'], answer:'Gerund', explanation:"'Being' as a gerund acts as a noun - subject of the sentence.", xp:25 },
    { id:29, type:'write', question:"Translate: 'Estou a ser observado.'", options:[], answer:'I am being watched.', accept:["i'm being watched."], explanation:"Present Continuous Passive: am/is/are + being + past participle.", xp:30 },
    { id:30, type:'multiple_choice', question:"'Were it not for your help, I would have failed.' - this uses:", options:['Inversion (formal subjunctive)','Past Simple','Conditional','Passive voice'], answer:'Inversion (formal subjunctive)', explanation:"'Were it not for...' = inversion of 'If it were not for...' - very formal English.", xp:35 },
  ],
}

// ─── W1D3 - Subject Pronouns ──────────────────────────────────────────────────
const SUBPRON: LessonDef = {
  id: 'w1d3', title: 'Subject Pronouns', week: 1, day: 3, level: 'A1', xp: 50, duration: '12 min', topic: 'Grammar',
  sections: [
    { type: 'intro', title: '📖 Grammar', content: 'Subject pronouns replace the subject of a sentence. They tell us WHO is doing the action.',
      examples: [
        { full: 'I - (eu)',                        translation: 'I am a student.' },
        { full: 'You - (tu / você)',               translation: 'You are my friend.' },
        { full: 'He - (ele)',                      translation: 'He is a doctor.' },
        { full: 'She - (ela)',                     translation: 'She is from Brazil.' },
        { full: 'It - (ele/ela - coisas/animais)', translation: 'It is a cat.' },
        { full: 'We - (nós)',                      translation: 'We are students.' },
        { full: 'They - (eles/elas)',              translation: 'They are my friends.' },
      ] },
    { type: 'tip', title: '💡 Tip', content: 'In English, "you" is used for BOTH singular and plural - "tu" AND "vocês". Objects always use "it" - a car, a book, an idea.' },
    { type: 'examples', title: '🗣️ Real Examples', sentences: [
      "This is my sister. She is a nurse.", "Where is Marco? He is at work.", "Look at that car! It is beautiful.",
    ]},
  ],
  stage1: [
    { id:1, type:'multiple_choice', question:"Ana é médica. Em inglês: '___ is a doctor.'", options:['She','He','It','They'], answer:'She', explanation:"Ana é feminino → She.", xp:10 },
    { id:2, type:'multiple_choice', question:"O gato está a dormir. Em inglês: '___ is sleeping.'", options:['It','He','She','They'], answer:'It', explanation:"Animais e objetos → It.", xp:10 },
    { id:3, type:'translation', question:"Translate: 'Eles são de Angola.'", options:['They are from Angola.','He are from Angola.','We are from Angola.','It are from Angola.'], answer:'They are from Angola.', explanation:"Eles (plural) → They.", xp:10 },
    { id:4, type:'fill_blank', question:"'___ am happy. ___ are my best friend.'", options:['I / You','You / I','She / He','We / They'], answer:'I / You', explanation:"I am... You are...", xp:15 },
    { id:5, type:'multiple_choice', question:"Marco e eu somos amigos. Em inglês: '___ are friends.'", options:['We','They','You','He'], answer:'We', explanation:"Marco e eu = nós → We.", xp:10 },
    { id:6, type:'multiple_choice', question:"A cadeira é vermelha. Em inglês?", options:['It is red.','He is red.','She is red.','They are red.'], answer:'It is red.', explanation:"Objetos → It.", xp:10 },
    { id:7, type:'write', question:"Translate: 'Tu és muito inteligente.'", options:[], answer:'You are very smart.', accept:["you're very smart."], explanation:"Tu → You (are).", xp:10 },
    { id:8, type:'fill_blank', question:"'___ is my teacher. ___ is very kind.'", options:['She / She','He / Her','She / Her','Her / She'], answer:'She / She', explanation:"Subject pronoun → She (not 'Her' which is object).", xp:15 },
    { id:9, type:'multiple_choice', question:"'Pedro and Maria are students.' Replace with pronoun:", options:['They','We','It','You'], answer:'They', explanation:"Pedro and Maria (2 people) → They.", xp:10 },
    { id:10, type:'write', question:"Translate: 'Eu e os meus amigos estamos cansados.'", options:[], answer:'We are tired.', accept:["we're tired."], explanation:"Eu + amigos = nós → We are tired.", xp:15 },
  ],
  stage2: [
    { id:11, type:'multiple_choice', question:"'___ is raining.' - which pronoun for weather?", options:['It','This','That','There'], answer:'It', explanation:"Weather, time, distance always use 'It': It is raining. It is 3pm. It is 5km.", xp:15 },
    { id:12, type:'write', question:"Translate: 'São eles os teus pais?'", options:[], answer:'Are they your parents?', explanation:"Eles → They; question: Are they...?", xp:15 },
    { id:13, type:'fill_blank', question:"'This is my cat. ___ name is Milo and ___ is very playful.'", options:['Its / it','His / he','Her / she','Their / they'], answer:'Its / it', explanation:"Possessive of 'it' = its (no apostrophe). Subject = it.", xp:20 },
    { id:14, type:'multiple_choice', question:"In English, 'você' is always translated as:", options:['You','He','She','One'], answer:'You', explanation:"Both 'tu' and 'você' → You in English. There's only one form.", xp:15 },
    { id:15, type:'translation', question:"Translate: 'Ela e eu somos colegas de trabalho.'", options:['She and I are colleagues.','She and me are colleagues.','Her and I are colleagues.','We and she are colleagues.'], answer:'She and I are colleagues.', explanation:"Subject pronouns: She and I (not 'me'). When in doubt, remove the other person: 'I am a colleague.'", xp:20 },
    { id:16, type:'multiple_choice', question:"'Between you and ___' - correct?", options:['me','I','we','us'], answer:'me', explanation:"After prepositions, use OBJECT pronouns: me, him, her, us, them - not subject pronouns.", xp:15 },
    { id:17, type:'fill_blank', question:"'___ is Monday and ___ is my first day of work.'", options:['It / it','This / it','It / this','Today / it'], answer:'It / it', explanation:"Days/time → 'It'. Second blank: 'it is my first day'.", xp:20 },
    { id:18, type:'translation', question:"Translate: 'São os alunos que fizeram isso?'", options:['Were they the students who did that?','Are they the students who did that?','Was it the students who did that?','It was the students?'], answer:'Were they the students who did that?', explanation:"Past: 'Were they...' - past of 'Are they...'", xp:15 },
    { id:19, type:'multiple_choice', question:"Formal English: 'It is ___ who made the mistake.'", options:['I','me','my','myself'], answer:'I', explanation:"Formal: 'It is I' (subject after 'to be'). Informal: 'It's me' is also accepted.", xp:20 },
    { id:20, type:'write', question:"Translate: 'Quem somos nós para julgar?'", options:[], answer:'Who are we to judge?', explanation:"'We' is subject → 'Who are we'. Not 'us' (that's object).", xp:15 },
  ],
  stage3: [
    { id:21, type:'multiple_choice', question:"'Everyone did ___ best.' - correct pronoun?", options:['their','his','her','its'], answer:'their', explanation:"Modern English: 'Everyone' → 'their' (singular they) is now standard.", xp:25 },
    { id:22, type:'write', question:"Translate formally: 'Fui eu que telefonei.'", options:[], answer:'It was I who called.', explanation:"Cleft sentence: 'It was I who...' - formal. 'It was me' is informal but very common.", xp:25 },
    { id:23, type:'fill_blank', question:"'Neither John nor ___ is responsible.'", options:['I','me','we','us'], answer:'I', explanation:"Neither/nor + subject → subject pronoun 'I' (not 'me').", xp:30 },
    { id:24, type:'multiple_choice', question:"'She is taller than ___.' - formal vs informal:", options:['Both "I" (formal) and "me" (informal) are used',"Only 'me' is correct","Only 'I' is correct","Neither is correct"], answer:'Both "I" (formal) and "me" (informal) are used', explanation:"'Taller than I' = formal. 'Taller than me' = informal. Both accepted.", xp:25 },
    { id:25, type:'write', question:"Translate: 'Que Deus nos ajude.'", options:[], answer:'May God help us.', explanation:"After verbs and prepositions: object pronoun 'us' (not 'we'). 'May' = subjunctive for wishes.", xp:25 },
    { id:26, type:'multiple_choice', question:"'___ is a long way from Luanda to London.' - filler subject?", options:['It','There','This','That'], answer:'It', explanation:"Filler 'It' for distance: 'It is 6,000km from Luanda to London.'", xp:25 },
    { id:27, type:'fill_blank', question:"'___ seems that ___ will rain.'", options:['It / it','There / it','It / there','This / it'], answer:'It / it', explanation:"'It seems that it will rain.' - weather + impersonal subject = 'it'.", xp:30 },
    { id:28, type:'translation', question:"Translate: 'São eles que têm razão, não somos nós.'", options:['It is they who are right, not us.','They are right, not we.','It is them who are right, not us.','They are right, not we are.'], answer:'It is they who are right, not us.', explanation:"Cleft: 'It is they who...' (formal). After 'not': 'us' (object position).", xp:30 },
    { id:29, type:'multiple_choice', question:"'One should always be honest.' - what does 'one' replace?", options:['A general person (impersonal)','I','You','We'], answer:'A general person (impersonal)', explanation:"'One' is a formal impersonal pronoun for general statements - common in formal/British English.", xp:25 },
    { id:30, type:'translation', question:"Translate (literary): 'Quem muito quer, nada tem.'", options:['He who wants too much gets nothing.','Who wants much, has nothing.','They who want much, have nothing.','One who wants much, has nothing.'], answer:'He who wants too much gets nothing.', explanation:"Proverb: 'He/She/One who...' for universal truths. 'He who' is the traditional literary form.", xp:35 },
  ],
}

// ─── W1D4 - Numbers & Age ─────────────────────────────────────────────────────
const NUMS: LessonDef = {
  id: 'w1d4', title: 'Numbers & Age', week: 1, day: 4, level: 'A1', xp: 50, duration: '12 min', topic: 'Vocabulary',
  sections: [
    { type: 'intro', title: '📖 Numbers', content: 'Numbers in English follow patterns. Learn the patterns and you can say any number.',
      examples: [
        { full: '1–10: one, two, three, four, five, six, seven, eight, nine, ten' },
        { full: '11–19: eleven, twelve, thirteen, fourteen, fifteen, sixteen, seventeen, eighteen, nineteen' },
        { full: '20, 30, 40: twenty, thirty, forty (NO "u"!), fifty, sixty, seventy, eighty, ninety' },
        { full: '21, 22: twenty-one, twenty-two (hyphen!)' },
        { full: '100, 1000: one hundred, one thousand' },
      ] },
    { type: 'tip', title: '💡 Tip', content: 'IMPORTANT: "forty" has NO "u" (not "fourty"). "Eleven" and "twelve" are irregular - memorise them!' },
    { type: 'examples', title: '🗣️ Age', sentences: [
      "How old are you? - I am 25 years old.", "My mother is 52. She is fifty-two.", "The company has 1,500 employees - one thousand five hundred.",
    ]},
  ],
  stage1: [
    { id:1, type:'write', question:"How do you write 40 in English?", options:[], answer:'forty', explanation:"'Forty' - no 'u'. Common mistake! 'Four' has a 'u' but 'forty' does not.", xp:10 },
    { id:2, type:'write', question:"How do you say '15' in English?", options:[], answer:'fifteen', explanation:"15 = fifteen. Note the 'fif-' not 'five-'.", xp:10 },
    { id:3, type:'write', question:"Write 23 in words (in 'I am ___ years old'):", options:[], answer:'twenty-three', explanation:"Numbers 21-99 use a hyphen: twenty-three, forty-seven, etc.", xp:10 },
    { id:4, type:'write', question:"Write 12 in words (in 'She is ___ years old'):", options:[], answer:'twelve', explanation:"12 = twelve. Irregular - must memorise!", xp:15 },
    { id:5, type:'write', question:"Write 11 in words (in 'The class has ___ students'):", options:[], answer:'eleven', explanation:"11 = eleven. Completely irregular!", xp:10 },
    { id:6, type:'translation', question:"Translate: 'O meu pai tem cinquenta e um anos.'", options:['My father is fifty-one years old.','My father is fifty one years old.','My father has fifty-one years.','My father is five-one years old.'], answer:'My father is fifty-one years old.', explanation:"'Is' (not 'has') for age in English. 51 = fifty-one (hyphen).", xp:10 },
    { id:7, type:'write', question:"Write 1000 in words:", options:[], answer:'one thousand', accept:['a thousand'], explanation:"1000 = one thousand (OR 'a thousand').", xp:10 },
    { id:8, type:'fill_blank', question:"'How ___ are you? I ___ 28.'", options:['old / am','years / am','old / have','age / am'], answer:'old / am', explanation:"'How OLD are you? I AM 28.' - use 'to be' for age in English.", xp:15 },
    { id:9, type:'write', question:"Write 19 in words:", options:[], answer:'nineteen', explanation:"19 = nineteen. Pattern: (number)-teen for 13-19.", xp:10 },
    { id:10, type:'translation', question:"Translate: 'Ela tem cem anos.'", options:['She is one hundred years old.','She is a hundred years old.','Both are correct.','She has one hundred years.'], answer:'Both are correct.', explanation:"Both 'one hundred' and 'a hundred' are correct in English.", xp:15 },
  ],
  stage2: [
    { id:11, type:'multiple_choice', question:"How do you say 1,500?", options:['one thousand five hundred','fifteen hundred','both are correct','one hundred fifty'], answer:'both are correct', explanation:"1,500 = 'one thousand five hundred' OR 'fifteen hundred' - both common.", xp:15 },
    { id:12, type:'translation', question:"How old is someone born in 1995 in 2025?", options:['thirty years old','twenty-five years old','thirty-five years old','twenty years old'], answer:'thirty years old', explanation:"2025 - 1995 = 30 years old.", xp:15 },
    { id:13, type:'fill_blank', question:"'The meeting is at ___ (2:30).'", options:['two thirty','two and thirty','half two','both "two thirty" and "half two" (British) are correct'], answer:'both "two thirty" and "half two" (British) are correct', explanation:"'Two thirty' (American) = 'half two' (British). Both mean 2:30.", xp:20 },
    { id:14, type:'write', question:"Write 1,000,000 in words:", options:[], answer:'one million', accept:['a million'], explanation:"1,000,000 = one million (OR 'a million').", xp:15 },
    { id:15, type:'translation', question:"Translate: 'Somos três irmãos.'", options:['There are three of us siblings.','We are three brothers.','I have two brothers.','We have three siblings.'], answer:'There are three of us siblings.', explanation:"'There are three of us' or 'We are three siblings.' - both natural.", xp:15 },
    { id:16, type:'multiple_choice', question:"'In the 21st century...' - how do you say '21st'?", options:['twenty-first','twenty-oneth','twentyieth-first','twenty-firsth'], answer:'twenty-first', explanation:"Ordinals: 1st, 2nd, 3rd, then -th. Exceptions: first, second, third, fifth, eighth, ninth, twelfth.", xp:15 },
    { id:17, type:'fill_blank', question:"'She was born on the ___ (3rd) of March.'", options:['third','thirth','threeth','three'], answer:'third', explanation:"3rd = third. Ordinal form.", xp:20 },
    { id:18, type:'multiple_choice', question:"'It costs $4.50.' - how do you say this?", options:['four dollars fifty','four fifty','four dollars and fifty cents','all of the above are correct'], answer:'all of the above are correct', explanation:"All three are natural ways to say prices in English!", xp:15 },
    { id:19, type:'translation', question:"Translate: 'O número do meu quarto é o 204.'", options:['My room number is two-oh-four.','My room number is two hundred four.','My room number is twenty-four.','Both first two are correct.'], answer:'Both first two are correct.', explanation:"Room/phone numbers: say each digit ('two-oh-four') or as a number ('two hundred four').", xp:15 },
    { id:20, type:'multiple_choice', question:"'I've told you a thousand times!' - what does this mean?", options:['I told you many, many times (exaggeration)','I literally told you 1000 times','I told you once','I need to tell you more'], answer:'I told you many, many times (exaggeration)', explanation:"Numbers are often used as hyperbole: 'a thousand times' = very many times.", xp:20 },
  ],
  stage3: [
    { id:21, type:'multiple_choice', question:"'The odds are one in a million.' - what does this mean?", options:['Very unlikely (0.000001 probability)','Very likely','Exactly 1 out of 1,000,000','Common occurrence'], answer:'Very unlikely (0.000001 probability)', explanation:"'One in a million' is an idiom for something extremely rare or unlikely.", xp:25 },
    { id:22, type:'translation', question:"Translate: 'É uma questão de vida ou morte.'", options:["It's a matter of life or death.","It's a question of life or death.","Both are correct.","Neither translates naturally."], answer:'Both are correct.', explanation:"'A matter of life or death' is the fixed English expression.", xp:25 },
    { id:23, type:'multiple_choice', question:"How do you read '007'?", options:['double oh seven','zero zero seven','oh oh seven','all are acceptable'], answer:'all are acceptable', explanation:"Phone/codes: 0 can be said as 'zero', 'oh', or 'nought' (British). All are used.", xp:25 },
    { id:24, type:'fill_blank', question:"'The company was valued at ___ (£2.5 billion).'", options:['two point five billion pounds','two and a half billion pounds','both are correct','2.5 billion'], answer:'both are correct', explanation:"Both 'two point five billion' and 'two and a half billion' are natural spoken English.", xp:25 },
    { id:25, type:'multiple_choice', question:"'She is in her thirties.' - what does this mean?", options:['She is between 30-39 years old','She is exactly 30','She is very old','She is in her 30s of something'], answer:'She is between 30-39 years old', explanation:"'In her thirties' = aged 30-39. 'In her twenties' = 20-29, etc.", xp:25 },
    { id:26, type:'translation', question:"Translate: 'De dois em dois dias.'", options:['Every two days.','Every other day.','Both mean every 2 days, so both are correct.','Twice a day.'], answer:'Both mean every 2 days, so both are correct.', explanation:"'Every two days' and 'every other day' both mean once every 2 days.", xp:25 },
    { id:27, type:'multiple_choice', question:"'To give someone the third degree' means:", options:['To interrogate intensely','To give a PhD','To rank third','To be third in line'], answer:'To interrogate intensely', explanation:"'Third degree' is an idiom for intense questioning/interrogation.", xp:30 },
    { id:28, type:'write', question:"'A ___ of a kind'", options:[], answer:'one', explanation:"'One of a kind' = unique, unlike anything else.", xp:25 },
    { id:29, type:'write', question:"Translate (idiom): 'Matar dois coelhos de uma cajadada só.'", options:[], answer:'To kill two birds with one stone.', explanation:"This is the English idiom equivalent. The image differs (birds vs rabbits) but the meaning is identical.", xp:30 },
    { id:30, type:'multiple_choice', question:"'The eleventh hour' means:", options:['The last possible moment','11 o\'clock','Very early morning','Almost too late, but not quite'], answer:'The last possible moment', explanation:"'At the eleventh hour' = at the last possible moment, just in time.", xp:35 },
  ],
}

// ─── W1D5 - Verb To Be Contractions ──────────────────────────────────────────
const CONTRACTIONS: LessonDef = {
  id: 'w1d5', title: 'Verb To Be - Contractions', week: 1, day: 5, level: 'A1', xp: 60, duration: '15 min', topic: 'Grammar',
  sections: [
    { type: 'intro', title: '📖 Grammar', content: 'The verb "To Be" has contractions - shorter forms used in spoken and informal written English.',
      examples: [
        { full: 'I am a student.',     contraction: "I'm a student." },
        { full: 'You are from Angola.',contraction: "You're from Angola." },
        { full: 'He is a teacher.',    contraction: "He's a teacher." },
        { full: 'She is smart.',       contraction: "She's smart." },
        { full: 'It is cold today.',   contraction: "It's cold today." },
        { full: 'We are ready.',       contraction: "We're ready." },
        { full: 'They are friends.',   contraction: "They're friends." },
      ] },
    { type: 'tip', title: '💡 Tip', content: "Contractions are ALWAYS used in spoken English. Using the full form can sound formal or even unnatural in conversation. Practice saying them naturally!" },
    { type: 'examples', title: '🗣️ Real Examples', sentences: [
      "Hi! I'm Ana. I'm from Luanda and I'm 24 years old.",
      "This is my friend Marco. He's a doctor and he's really good at his job.",
      "We're learning English because it's the most important language for our careers.",
    ]},
  ],
  stage1: [
    { id:1, type:'multiple_choice', question:"Choose the correct contraction: 'I am a student.'", options:["I'm a student.", "Im a student.", "I'am a student.", "I am' student."], answer:"I'm a student.", explanation:"'I am' → 'I'm' - the apostrophe replaces the 'a'.", xp:10 },
    { id:2, type:'write', question:"Translate: 'Ela é professora.'", options:[], answer:"She's a teacher.", accept:["she is a teacher."], explanation:"'She is' → 'She's'. We also need 'a' before teacher.", xp:10 },
    { id:3, type:'multiple_choice', question:"Which sentence uses the WRONG contraction?", options:["We're from Angola.", "They're happy.", "He's at school.", "You'r a friend."], answer:"You'r a friend.", explanation:"Correct is 'You're' (You are) - not 'You'r'.", xp:10 },
    { id:4, type:'fill_blank', question:"Complete: 'Hi! _____ Maria and _____ 22 years old.'", options:["I'm / I'm", "Im / Im", "I am / I'm", "I'm / I are"], answer:"I'm / I'm", explanation:"Both use 'I'm' - contraction of 'I am'.", xp:15 },
    { id:5, type:'multiple_choice', question:"Contraction of 'It is raining today'?", options:["It's raining today.", "Its raining today.", "It'raining today.", "It is' raining today."], answer:"It's raining today.", explanation:"'It is' → 'It's'. 'Its' (no apostrophe) is possessive.", xp:10 },
    { id:6, type:'write', question:"Translate: 'Nós somos estudantes.'", options:[], answer:"We're students.", accept:["we are students."], explanation:"'We are' → 'We're'.", xp:10 },
    { id:7, type:'multiple_choice', question:"Pick the correct sentence:", options:["He's from Brazil.", "He'is from Brazil.", "Hes from Brazil.", "He are from Brazil."], answer:"He's from Brazil.", explanation:"'He is' → 'He's'.", xp:10 },
    { id:8, type:'fill_blank', question:"Complete: 'This is Ana. _____ a doctor.'", options:["She's", "Shes", "Her's", "She is'"], answer:"She's", explanation:"'She is' → 'She's'.", xp:10 },
    { id:9, type:'translation', question:"Translate: 'Eles são amigos.'", options:["They're friends.", "They is friends.", "Them are friends.", "They're' friends."], answer:"They're friends.", explanation:"'They are' → 'They're'.", xp:10 },
    { id:10, type:'multiple_choice', question:"Which word can NOT be contracted with 'is'?", options:['It','He','She','Are'], answer:'Are', explanation:"'Are' is already a form of 'to be' - it contracts differently: 'they're', 'we're'.", xp:15 },
  ],
  stage2: [
    { id:11, type:'multiple_choice', question:"'Its' vs 'It's' - which is correct? 'The dog wagged ___ tail.'", options:['its',"it's","its'",'it is'], answer:'its', explanation:"'Its' (no apostrophe) = possessive. 'It's' = 'it is'.", xp:15 },
    { id:12, type:'multiple_choice', question:"'There's a problem.' in full?", options:['There is a problem.','There are a problem.','There was a problem.','There has a problem.'], answer:'There is a problem.', explanation:"'There's' = 'There is'. For plural: 'There are'.", xp:15 },
    { id:13, type:'fill_blank', question:"'_____ not my fault. _____ his mistake.'", options:["It's / It's","Its / Its","It's / Its","Its / It's"], answer:"It's / It's", explanation:"Both mean 'it is' - use 'it's' (apostrophe).", xp:20 },
    { id:14, type:'write', question:"Translate: 'Quem é ela?'", options:[], answer:"Who's she?", accept:["who is she?"], explanation:"'Who's' = 'Who is'. The contraction is more natural.", xp:15 },
    { id:15, type:'multiple_choice', question:"Which is WRONG in formal written English?", options:['We are pleased to inform you.',"I'm writing to apply.","They're available tomorrow.","She's the CEO."], answer:"I'm writing to apply.", explanation:"In very formal writing, full forms are preferred: 'I am writing'.", xp:20 },
    { id:16, type:'multiple_choice', question:"'You're' vs 'your' - '___ welcome!'", options:["You're","Your","Youre","You are'"], answer:"You're", explanation:"'You're welcome' = 'You are welcome'. 'Your' is possessive.", xp:15 },
    { id:17, type:'fill_blank', question:"'They said _____ coming but _____ car broke down.'", options:["they're / their","their / they're","there / their","they're / there"], answer:"they're / their", explanation:"'They're' = they are. 'Their' = possessive.", xp:25 },
    { id:18, type:'write', question:"Translate naturally: 'Onde estão eles?'", options:[], answer:"Where're they?", explanation:"'Where are they?' is standard. 'Where're they?' is informal but natural.", xp:15 },
    { id:19, type:'multiple_choice', question:"'She is not' - possible contractions:", options:["She isn't","She's not","Both are correct","She not's"], answer:"Both are correct", explanation:"'She isn't' and 'She's not' are equally correct contractions of 'She is not'.", xp:20 },
    { id:20, type:'multiple_choice', question:"'He is been' is wrong. Why?", options:["'Has been' is correct","'Is been' is correct","'He's been' is wrong too","It should be 'He are been'"], answer:"'Has been' is correct", explanation:"Present Perfect: 'He has been' → 'He's been'. 'Is been' doesn't exist.", xp:20 },
  ],
  stage3: [
    { id:21, type:'multiple_choice', question:"'I'd' can be short for which TWO forms?", options:["'I would' and 'I had'","'I did' and 'I would'","'I do' and 'I had'","'I will' and 'I would'"], answer:"'I would' and 'I had'", explanation:"'I'd go' = 'I would go'. 'I'd been there' = 'I had been there'.", xp:25 },
    { id:22, type:'fill_blank', question:"'_____ been waiting for an hour!' (frustration)", options:["I've","I'd","I'm","I'll"], answer:"I've", explanation:"'I've been waiting' = 'I have been waiting' - Present Perfect Continuous.", xp:25 },
    { id:23, type:'multiple_choice', question:"Which contraction is IMPOSSIBLE in standard English?", options:["Amn't (am not)","Aren't (are not)","Isn't (is not)","Weren't (were not)"], answer:"Amn't (am not)", explanation:"'Amn't' doesn't exist in standard English. We say 'I'm not' or 'aren't I?' in questions.", xp:30 },
    { id:24, type:'write', question:"Translate naturally: 'Eu teria ido se soubesse.'", options:[], answer:"I'd have gone if I'd known.", accept:["i would have gone if i would known."], explanation:"Third conditional: 'I would have gone if I had known' → 'I'd have gone if I'd known.'", xp:30 },
    { id:25, type:'multiple_choice', question:"Which sentence is grammatically perfect?", options:["She'd rather not've said that.","She'd rather not have said that.","She'd rather not has said that.","She'd rather haven't said that."], answer:"She'd rather not have said that.", explanation:"'Would rather' + bare infinitive: 'not have said' (perfect infinitive).", xp:25 },
    { id:26, type:'multiple_choice', question:"'They'll've finished by now.' - 'll've means:", options:["'will have'","'will be'","'would have'","'shall be'"], answer:"'will have'", explanation:"'They'll've finished' = 'They will have finished' - Future Perfect.", xp:30 },
    { id:27, type:'fill_blank', question:"'If I _____ you, I _____ apologise.' (advice)", options:["were / 'd","was / will","am / would","be / should"], answer:"were / 'd", explanation:"Second conditional: 'If I were you, I'd apologise.' ('were' for all persons in hypotheticals)", xp:25 },
    { id:28, type:'multiple_choice', question:"'gonna' is a reduction of:", options:["'going to'","'gone to'","'got to'","'go to'"], answer:"'going to'", explanation:"'gonna' = 'going to'. Common in speech but avoid in formal writing.", xp:20 },
    { id:29, type:'multiple_choice', question:"Formal equivalent of 'We'd better not've done that'?", options:["We had better not have done that.","We would better not do that.","We have better not done that.","We better had not done that."], answer:"We had better not have done that.", explanation:"'We'd better' = 'We had better'. Past perfect: 'not have done'.", xp:30 },
    { id:30, type:'write', question:"Translate (expert): 'Não devia ter dito isso, pois não?'", options:[], answer:"I shouldn't have said that, should I?", accept:["i should not have said that, should i?"], explanation:"Question tag after negative: 'shouldn't I?' → 'should I?'. Past: 'shouldn't have said'.", xp:35 },
  ],
}

// ─── W1D6 - Countries & Nationalities ────────────────────────────────────────
const COUNTRIES: LessonDef = {
  id: 'w1d6', title: 'Countries & Nationalities', week: 1, day: 6, level: 'A1', xp: 50, duration: '12 min', topic: 'Vocabulary',
  sections: [
    { type: 'intro', title: '📖 Countries', content: 'Every country has a nationality adjective and a language. The patterns help you guess unfamiliar ones.',
      examples: [
        { full: 'Angola → Angolan (angolano/a)' },
        { full: 'Brazil → Brazilian (brasileiro/a)' },
        { full: 'Portugal → Portuguese (português/a)' },
        { full: 'England → English (inglês/inglesa)' },
        { full: 'United States → American (americano/a)' },
        { full: 'France → French (francês/francesa)' },
        { full: 'China → Chinese (chinês/chinesa)' },
      ] },
    { type: 'tip', title: '💡 Tip', content: 'Nationalities are ALWAYS capitalised in English: I am Angolan. She is Brazilian. He speaks Portuguese. Never write "angolan" with a small letter!' },
    { type: 'examples', title: '🗣️ Real Examples', sentences: [
      "I am Angolan. I speak Portuguese and English.", "She is Brazilian but she lives in London.", "My teacher is British. She is from Manchester.",
    ]},
  ],
  stage1: [
    { id:1, type:'multiple_choice', question:"What is the nationality for someone from Angola?", options:['Angolan','Angolian','Angolese','Angolic'], answer:'Angolan', explanation:"Angola → Angolan. The suffix -an is very common.", xp:10 },
    { id:2, type:'multiple_choice', question:"Someone from Brazil is:", options:['Brazilian','Brazilish','Brazilean','Braziler'], answer:'Brazilian', explanation:"Brazil → Brazilian. Note: -ian ending.", xp:10 },
    { id:3, type:'write', question:"Translate: 'Eu sou português.'", options:[], answer:'I am Portuguese.', accept:["i'm portuguese."], explanation:"Portugal → Portuguese. One of the irregular forms.", xp:10 },
    { id:4, type:'multiple_choice', question:"Someone from England is:", options:['English','Englishman (male) or English','Englander','Britisher'], answer:'English', explanation:"England → English. 'Englishman/Englishwoman' are also used.", xp:15 },
    { id:5, type:'fill_blank', question:"'She is from France. She is _____ and she speaks _____.'", options:['French / French','Frencher / French','French / Frenchy','Française / French'], answer:'French / French', explanation:"France → French (nationality AND language). One of the irregular forms.", xp:10 },
    { id:6, type:'multiple_choice', question:"Someone from the USA is:", options:['American','United Statesian','USAian','North American'], answer:'American', explanation:"USA → American. Note: 'American' also refers to the whole continent.", xp:10 },
    { id:7, type:'write', question:"Translate: 'O meu amigo é chinês.'", options:[], answer:'My friend is Chinese.', explanation:"China → Chinese. Ends in -ese.", xp:10 },
    { id:8, type:'fill_blank', question:"'He is from Germany. He is _____.'", options:['German','Germanian','Germanish','Germanous'], answer:'German', explanation:"Germany → German. Irregular - no suffix, just 'German'.", xp:10 },
    { id:9, type:'multiple_choice', question:"Nationalities in English are always:", options:['Capitalised (I am Angolan)','Lowercase (i am angolan)','Italicised','In quotes'], answer:'Capitalised (I am Angolan)', explanation:"All nationalities, languages, and country names are CAPITALISED in English.", xp:10 },
    { id:10, type:'translation', question:"Translate: 'Somos africanos.'", options:['We are African.','We are Africans.','Both are correct.','We are from Africa.'], answer:'Both are correct.', explanation:"'We are African' (adjective) or 'We are Africans' (noun) - both are correct!", xp:15 },
  ],
  stage2: [
    { id:11, type:'multiple_choice', question:"What do you call the language spoken in Brazil?", options:['Portuguese','Brazilian','Brazilian Portuguese','South American'], answer:'Portuguese', explanation:"Brazil speaks Portuguese. You can say 'Brazilian Portuguese' to be specific.", xp:15 },
    { id:12, type:'write', question:"Translate: 'Falo quatro línguas: inglês, português, francês e espanhol.'", options:[], answer:'I speak four languages: English, Portuguese, French and Spanish.', explanation:"Languages are always capitalised in English!", xp:15 },
    { id:13, type:'multiple_choice', question:"Someone from Japan is:", options:['Japanese','Japanish','Japaner','Japonian'], answer:'Japanese', explanation:"Japan → Japanese. Ends in -ese (like Chinese, Portuguese).", xp:15 },
    { id:14, type:'fill_blank', question:"'She is from _____ (Brasil) and speaks _____ (língua).'", options:['Brazil / Portuguese','Brazil / Brazilian','Brazilian / Portuguese','Brasil / Portuguese'], answer:'Brazil / Portuguese', explanation:"Country: Brazil (not 'Brasil'). Language: Portuguese (not 'Brazilian').", xp:20 },
    { id:15, type:'multiple_choice', question:"What is 'British'?", options:['From the United Kingdom (England, Scotland, Wales, N.Ireland)','Only from England','From Britain (Great Britain only)','From the British Empire'], answer:'From the United Kingdom (England, Scotland, Wales, N.Ireland)', explanation:"'British' = from the UK. Someone from Scotland is British (and Scottish).", xp:15 },
    { id:16, type:'write', question:"Translate: 'Qual é a tua nacionalidade?'", options:[], answer:'What is your nationality?', accept:["what's your nationality?"], explanation:"'What is your nationality?' is the standard form. 'What nationality are you?' is also common.", xp:15 },
    { id:17, type:'multiple_choice', question:"Someone from Russia is:", options:['Russian','Russish','Russic','Russer'], answer:'Russian', explanation:"Russia → Russian. Ends in -an.", xp:15 },
    { id:18, type:'fill_blank', question:"'I am from _____ and I am _____ (nationality).' - Angola", options:['Angola / Angolan','Angola / Angolian','Angolan / Angola','Angola / Angola'], answer:'Angola / Angolan', explanation:"Country: Angola. Nationality adjective: Angolan.", xp:20 },
    { id:19, type:'multiple_choice', question:"What language do people speak in Australia?", options:['English (Australian English)','Australian','Australish','British English'], answer:'English (Australian English)', explanation:"Australia speaks English - specifically Australian English, with its own accent and vocabulary.", xp:15 },
    { id:20, type:'translation', question:"Translate: 'Metade dos meus colegas são estrangeiros.'", options:['Half of my colleagues are foreigners.','Half my colleagues are foreign.','Both are correct.','Half of my colleagues is foreign.'], answer:'Both are correct.', explanation:"'foreigners' (noun) or 'foreign' (adjective) - both work. 'Half of my colleagues ARE' - plural.", xp:20 },
  ],
  stage3: [
    { id:21, type:'multiple_choice', question:"'Lingua franca' - what does this term mean?", options:['A common language used between speakers of different languages','A French dialect','A Portuguese expression','An African language'], answer:'A common language used between speakers of different languages', explanation:"'Lingua franca' = a shared language for communication. English is the current global lingua franca.", xp:25 },
    { id:22, type:'translation', question:"Translate: 'Sou angolano de origem mas cresci no Brasil.'", options:['I am Angolan by origin but I grew up in Brazil.','I am Angolan-origin but grew up Brazilian.','I am of Angolan origin but raised in Brazil.','Both first and third are correct.'], answer:'Both first and third are correct.', explanation:"Both express dual nationality/background naturally.", xp:25 },
    { id:23, type:'multiple_choice', question:"What is a 'diaspora'?", options:['People living outside their country of origin','Immigrants who just arrived','Second-generation immigrants only','Stateless people'], answer:'People living outside their country of origin', explanation:"The 'Angolan diaspora' = Angolans living abroad. From Greek 'diaspora' = scattering.", xp:25 },
    { id:24, type:'fill_blank', question:"'Her mother is _____ and her father is _____. She is _____-_____.' (Angolan + Brazilian)", options:['Angolan / Brazilian / Angolan-Brazilian','Angola / Brazil / Angola-Brazil','Angolian / Brazilish / mixed','Angolan / Brazilian / mixed'], answer:'Angolan / Brazilian / Angolan-Brazilian', explanation:"Hyphenated nationalities express mixed heritage: 'Angolan-Brazilian'.", xp:30 },
    { id:25, type:'multiple_choice', question:"In English, saying 'the French' means:", options:['French people in general','One French person','The French language','The French government'], answer:'French people in general', explanation:"'The + nationality adjective' = that nation's people: 'the French love cheese', 'the English drink tea'.", xp:25 },
    { id:26, type:'translation', question:"Translate: 'Os países lusófonos incluem Angola, Brasil e Portugal.'", options:['The Lusophone countries include Angola, Brazil and Portugal.','The Portuguese-speaking countries include Angola, Brazil and Portugal.','Both are correct.','Lusophone countries includes Angola, Brazil and Portugal.'], answer:'Both are correct.', explanation:"'Lusophone' is used in English. 'Portuguese-speaking' is the plain alternative.", xp:25 },
    { id:27, type:'multiple_choice', question:"What is 'xenophobia'?", options:['Fear or hatred of foreigners','Love of foreign cultures','Study of languages','International diplomacy'], answer:'Fear or hatred of foreigners', explanation:"From Greek: xeno (foreign) + phobia (fear). Opposite: 'xenophilia' = love of foreign cultures.", xp:25 },
    { id:28, type:'write', question:"'She is a _____ national.' (has citizenship of two countries)", options:[], answer:'dual', explanation:"'Dual national' = person with citizenship of two countries.", xp:25 },
    { id:29, type:'translation', question:"Translate: 'Fui naturalizado britânico.'", options:['I was naturalised British.','I became a British citizen.','I naturalised as British.','Both first and second are correct.'], answer:'Both first and second are correct.', explanation:"'Naturalised' = formally granted citizenship. Both phrasings are natural.", xp:30 },
    { id:30, type:'multiple_choice', question:"'Cosmopolitan' describes:", options:['A city/person with people/influences from many countries','Only European cities','Rich international tourists','People without nationality'], answer:'A city/person with people/influences from many countries', explanation:"'Cosmopolitan' = internationally diverse and sophisticated.", xp:35 },
  ],
}

// ─── W1D7 - Colors & Descriptions ────────────────────────────────────────────
const COLORS: LessonDef = {
  id: 'w1d7', title: 'Colors & Descriptions', week: 1, day: 7, level: 'A1', xp: 50, duration: '12 min', topic: 'Vocabulary',
  sections: [
    { type: 'intro', title: '📖 Colors', content: 'Colours (British) or colors (American) describe the world around us.',
      examples: [
        { full: 'red (vermelho)',    contraction: 'The car is red.' },
        { full: 'blue (azul)',       contraction: 'The sky is blue.' },
        { full: 'green (verde)',     contraction: 'The grass is green.' },
        { full: 'yellow (amarelo)',  contraction: 'The sun is yellow.' },
        { full: 'black (preto)',     contraction: 'The night is black.' },
        { full: 'white (branco)',    contraction: 'The snow is white.' },
        { full: 'orange (laranja)',  contraction: 'The fruit is orange.' },
      ] },
    { type: 'tip', title: '💡 Tip', content: "In English, adjectives come BEFORE the noun: 'a red car' (NOT 'a car red'). This is opposite to Portuguese: 'um carro vermelho'." },
    { type: 'examples', title: '🗣️ Real Examples', sentences: [
      "I have a black phone and a blue bag.", "She is wearing a beautiful red dress.", "The new office has white walls and grey floors.",
    ]},
  ],
  stage1: [
    { id:1, type:'multiple_choice', question:"'Vermelho' in English is:", options:['red','orange','pink','brown'], answer:'red', explanation:"Red = vermelho.", xp:10 },
    { id:2, type:'write', question:"Translate: 'O céu é azul.'", options:[], answer:'The sky is blue.', explanation:"'The sky IS blue.' - use 'the' with specific things.", xp:10 },
    { id:3, type:'multiple_choice', question:"In English, adjectives go:", options:['Before the noun (a red car)','After the noun (a car red)','After the verb only','Before the verb'], answer:'Before the noun (a red car)', explanation:"English: a RED car. Portuguese: um carro VERMELHO. Opposite order!", xp:10 },
    { id:4, type:'fill_blank', question:"'She has _____ hair and _____ eyes.'", options:['black / brown','blacks / browns','black / brownie','blacked / browned'], answer:'black / brown', explanation:"Adjectives don't change form in English - same for singular/plural, male/female.", xp:15 },
    { id:5, type:'multiple_choice', question:"'Amarelo' in English:", options:['yellow','yell','yallow','yllow'], answer:'yellow', explanation:"Yellow = amarelo.", xp:10 },
    { id:6, type:'write', question:"Translate: 'O meu carro é verde.'", options:[], answer:'My car is green.', explanation:"'My car IS green.' Simple!", xp:10 },
    { id:7, type:'multiple_choice', question:"'A white dress' - in Portuguese this is:", options:['Um vestido branco','Um branco vestido','Branco um vestido','Um vestido de branco'], answer:'Um vestido branco', explanation:"English: adjective BEFORE noun. Portuguese: adjective AFTER noun.", xp:10 },
    { id:8, type:'fill_blank', question:"'The traffic light has _____, _____ and _____ lights.'", options:['red / yellow / green','red / orange / green','stop / slow / go','pink / gold / blue'], answer:'red / yellow / green', explanation:"Traffic lights: RED (stop), YELLOW/AMBER (caution), GREEN (go).", xp:10 },
    { id:9, type:'multiple_choice', question:"'Laranja' (colour) in English:", options:['orange','laran','reddish-yellow','tangerine'], answer:'orange', explanation:"Orange = laranja (both the fruit AND the colour).", xp:10 },
    { id:10, type:'translation', question:"Translate: 'Tenho cabelo preto e olhos castanhos.'", options:['I have black hair and brown eyes.','I have black hairs and brown eyes.','My hair is black and my eyes are brown.','Both first and third are correct.'], answer:'Both first and third are correct.', explanation:"'I have black hair' or 'My hair is black' - both natural English.", xp:15 },
  ],
  stage2: [
    { id:11, type:'multiple_choice', question:"'A tall, dark, handsome man.' - how many adjectives?", options:['3','1','2','4'], answer:'3', explanation:"tall + dark + handsome = 3 adjectives before the noun.", xp:15 },
    { id:12, type:'write', question:"Translate: 'Ela usa um lindo vestido vermelho longo.'", options:[], answer:'She wears a beautiful long red dress.', explanation:"English adjective order: opinion → size → colour → noun.", xp:20 },
    { id:13, type:'multiple_choice', question:"Correct adjective order for 'big + old + blue + house':", options:['a big old blue house','a blue big old house','a old big blue house','an old big blue house'], answer:'a big old blue house', explanation:"Order: size (big) → age (old) → colour (blue) → noun (house).", xp:20 },
    { id:14, type:'fill_blank', question:"'She has ___ beautiful ___ eyes.' (blue / big)", options:['big / blue','blue / big','beautiful / blue','blue / beautiful'], answer:'big / blue', explanation:"Beautiful is opinion (already placed), so: big (size) → blue (colour).", xp:20 },
    { id:15, type:'multiple_choice', question:"'Light blue' vs 'dark blue' - what do light/dark mean here?", options:['Shade/intensity modifiers','Separate colours','Noun modifiers','Brightness adjectives'], answer:'Shade/intensity modifiers', explanation:"'Light' = paler version, 'dark' = deeper version.", xp:15 },
    { id:16, type:'translation', question:"Translate: 'Qual é a tua cor preferida?'", options:["What is your favourite colour?","What's your favorite color?","What colour do you prefer?","All of the above are correct."], answer:'All of the above are correct.', explanation:"All are correct: British = 'favourite colour'; American = 'favorite color'.", xp:15 },
    { id:17, type:'multiple_choice', question:"'She turned red.' - what does this mean?", options:['She blushed (ficou corada)','She painted herself red','She changed her clothes','She became angry (idiom)'], answer:'She blushed (ficou corada)', explanation:"'Turn red' = blush from embarrassment.", xp:15 },
    { id:18, type:'fill_blank', question:"'The situation is not black and white.' - meaning:", options:['It is not simple/clear-cut','It has no colors','It is confusing','It is dark'], answer:'It is not simple/clear-cut', explanation:"'Black and white' = simple, clear. 'Not black and white' = complex, nuanced.", xp:20 },
    { id:19, type:'multiple_choice', question:"'She has a green thumb.' - meaning:", options:['She is good at gardening','Her thumb is literally green','She is environmentally friendly','She is jealous'], answer:'She is good at gardening', explanation:"'A green thumb' (AmE) / 'green fingers' (BrE) = natural ability to grow plants.", xp:15 },
    { id:20, type:'write', question:"Translate: 'Ela é alta, morena e tem cabelo cacheado.'", options:[], answer:'She is tall, dark-skinned and has curly hair.', accept:["she's tall, dark-skinned and has curly hair."], explanation:"Dark-skinned (morena), curly (cacheado). 'Brunette' means dark hair, not dark skin.", xp:20 },
  ],
  stage3: [
    { id:21, type:'multiple_choice', question:"'Seeing the world through rose-tinted glasses' means:", options:['Being overly optimistic','Literally wearing pink glasses','Having good vision','Being artistic'], answer:'Being overly optimistic', explanation:"Rose-tinted glasses = seeing things better than they are.", xp:25 },
    { id:22, type:'write', question:"Translate the idiom: 'Ficar com inveja.' using colour", options:[], answer:"To turn green with envy.", explanation:"Green = envy in English. 'Green-eyed monster' = jealousy (Shakespeare).", xp:25 },
    { id:23, type:'fill_blank', question:"'She was in a ___ mood all day.' (depressed/sad)", options:['blue','black','grey','dark'], answer:'blue', explanation:"'Feeling blue' = sad/depressed. 'I've got the blues' = I'm sad/melancholy.", xp:25 },
    { id:24, type:'multiple_choice', question:"'A grey area' means:", options:['An unclear situation with no obvious right/wrong','A boring topic','Something literally grey','An urban area'], answer:'An unclear situation with no obvious right/wrong', explanation:"Grey area = ambiguous, not clearly right or wrong.", xp:25 },
    { id:25, type:'translation', question:"Translate: 'Ela ficou pálida de susto.'", options:['She turned pale with fright.','She became white from fear.','She went white as a sheet.','Both first and third are correct.'], answer:'Both first and third are correct.', explanation:"'Turned pale' or 'went white as a sheet' - both natural.", xp:25 },
    { id:26, type:'multiple_choice', question:"'Red tape' refers to:", options:['Bureaucratic rules that slow things down','Actual red tape/ribbon','Emergency procedures','Important deadlines'], answer:'Bureaucratic rules that slow things down', explanation:"'Red tape' = excessive bureaucracy. From historical use of red ribbon to bind official documents.", xp:25 },
    { id:27, type:'write', question:"'She was caught ___ handed.' (committing a crime)", options:[], answer:'red', explanation:"'Caught red-handed' = caught in the act of doing something wrong.", xp:25 },
    { id:28, type:'translation', question:"Translate: 'Estou a ver vermelho.' (idiom)", options:['I am seeing red.','I am angry.','Both mean I am very angry.','I am embarrassed.'], answer:'Both mean I am very angry.', explanation:"'Seeing red' in English means being extremely angry - same idiom as Portuguese!", xp:25 },
    { id:29, type:'multiple_choice', question:"'The grass is always greener on the other side' means:", options:["Other people's lives seem better than yours","Grass is greener after rain","You should change jobs","Nature is important"], answer:"Other people's lives seem better than yours", explanation:"This proverb = people always think others have it better.", xp:30 },
    { id:30, type:'translation', question:"Translate (advanced): 'O dinheiro não tem cor.'", options:['Money has no colour.','Money is colourless.','Money is the same colour worldwide.','All three express the concept differently.'], answer:'All three express the concept differently.', explanation:"The English equivalent is 'Money has no smell' (from Latin 'Pecunia non olet'). Each language has its own idiom.", xp:35 },
  ],
}

// ─── Lesson registry ──────────────────────────────────────────────────────────
const LESSONS: Record<string, LessonDef> = {
  // ── Week 1: Foundations ──
  w1d1: GREET,
  w1d2: VTB1,
  w1d3: SUBPRON,
  w1d4: NUMS,
  w1d5: CONTRACTIONS,
  w1d6: COUNTRIES,
  w1d7: COLORS,

  // ── Weeks 2–5: full content (Present Continuous, Present Simple, Past Simple, Future) ──
  ...WEEK_2_5,

  // ── Month 2 (February): Modals · Questions Mastery · Practical Vocabulary ──
  ...MONTH_2,

  // ── Month 3 (March): Articles · Prepositions · Quantifiers · Vocabulary ──
  ...MONTH_3,

  // ── Month 4 (April): Present Perfect · Comparatives · Adverbs · Practical A2 ──
  ...MONTH_4,

  // ── Month 5 (May): Past Continuous · used to/would · Past Perfect · Storytelling ──
  ...MONTH_5,

  // ── Month 6 (June): Phrasal Verbs · Zero & First Conditional · Passive Voice ──
  ...MONTH_6,

  // ── Month 7 (July): Reported Speech · Relative Clauses · wish/if only · 2nd Conditional ──
  ...MONTH_7,

  // ── Month 8 (August): Third & Mixed Conditionals · Modals of Deduction · Gerunds & Infinitives · Future Forms ──
  ...MONTH_8,

  // ── Month 9 (September): Rich Vocabulary & Register, Collocations · Idioms · Formal/Informal Register · Word Formation ──
  ...MONTH_9,

  // ── Month 10 (October): Sophistication & Emphasis, Inversion · Cleft Sentences · Discourse Markers · Advanced Structures ──
  ...MONTH_10,

  // ── Month 11 (November): Nuance & Academic English, Subjunctive · Ellipsis & Substitution · Academic Writing · Nuance & Connotation ──
  ...MONTH_11,

  // ── Month 12 (December): Total Mastery & Certification, Figurative Language · Rhetoric · Advanced Style · C2 Certification ──
  ...MONTH_12,
}

// ─── Ordered curriculum sequence (one lesson unlocked per day) ────────────────
// Position in this array = day-of-year (index 0 → day 1). Months are derived
// from these positions by getLessonsByMonth() using DAYS_PER_MONTH.
export const LESSON_SEQUENCE: string[] = [
  // ── Month 1 - January (days 1–31): Foundations → Present/Past/Future ──
  'w1d1','w1d2','w1d3','w1d4','w1d5','w1d6','w1d7',
  'w2d1','w2d2','w2d3','w2d4','w2d5','w2d6','w2d7',
  'w3d1','w3d2','w3d3','w3d4','w3d5','w3d6','w3d7',
  'w4d1','w4d2','w4d3','w4d4','w4d5','w4d6','w4d7',
  'w5d1','w5d2','w5d3',
  // ── Month 2 - February (days 32–59): Future wrap-up + Modals/Questions/Vocab ──
  'w5d4','w5d5','w5d6','w5d7',
  ...MONTH_2_SEQUENCE,
  // ── Month 3 - March (days 60–91): Articles · Prepositions · Quantifiers · Vocabulary ──
  ...MONTH_3_SEQUENCE,
  // ── Month 4 - April (days 92–119): Present Perfect · Comparatives · Adverbs · Practical A2 ──
  ...MONTH_4_SEQUENCE,
  // ── Month 5 - May (days 120–150): Past Continuous · used to/would · Past Perfect · Storytelling ──
  ...MONTH_5_SEQUENCE,
  // ── Month 6 - June (days 151–181): Phrasal Verbs · Zero & First Conditional · Passive Voice ──
  ...MONTH_6_SEQUENCE,
  // ── Month 7 - July (days 182–212): Reported Speech · Relative Clauses · wish/if only · 2nd Conditional ──
  ...MONTH_7_SEQUENCE,
  // ── Month 8 - August (days 213–243): Third & Mixed Conditionals · Modals of Deduction · Gerunds & Infinitives · Future Forms ──
  ...MONTH_8_SEQUENCE,
  // ── Month 9 - September (days 244–274): Rich Vocabulary & Register, Collocations · Idioms · Register · Word Formation ──
  ...MONTH_9_SEQUENCE,
  // ── Month 10 - October (days 275–305): Sophistication & Emphasis, Inversion · Clefts · Discourse Markers · Advanced Structures ──
  ...MONTH_10_SEQUENCE,
  // ── Month 11 - November (days 306–335): Nuance & Academic English, Subjunctive · Ellipsis · Academic Writing · Nuance ──
  ...MONTH_11_SEQUENCE,
  // ── Month 12 - December (days 336–366): Total Mastery & Certification, Figurative Language · Rhetoric · Style · C2 Cert ──
  ...MONTH_12_SEQUENCE,
]

// ─── Week metadata ────────────────────────────────────────────────────────────
export const WEEK_INFO: Record<number, { title: string; subtitle: string }> = {
  1: { title: 'Week 1 - Foundations',        subtitle: 'Greetings · Verb To Be · Pronouns · Numbers' },
  2: { title: 'Week 2 - Present Continuous', subtitle: 'I am working · She is studying · Are you coming?' },
  3: { title: 'Week 3 - Present Simple',     subtitle: 'I work · She works · Do/Does · WH Questions' },
  4: { title: 'Week 4 - Past Simple',        subtitle: 'I worked · Was/Were · Did · Irregular Verbs' },
  5: { title: 'Week 5 - Future',             subtitle: 'Will · Going to · Plans & Predictions' },
  14: { title: 'Week 14 - Present Perfect',   subtitle: 'have/has done · ever/never · already/yet/just · for/since' },
  15: { title: 'Week 15 - Comparing',         subtitle: 'Comparatives · Superlatives · as…as · too/enough' },
  16: { title: 'Week 16 - Adverbs',           subtitle: 'Manner · Frequency · Degree · so/such · word order' },
  17: { title: 'Week 17 - Real Life',         subtitle: 'Travel · Restaurant · Shopping · Health · Plans · Phone' },
  18: { title: 'Week 18 - Past Continuous',   subtitle: 'was/were doing · interrupted actions · while/when · scene-setting' },
  19: { title: 'Week 19 - used to & would',   subtitle: 'Past habits & states · would · be/get used to · how things changed' },
  20: { title: 'Week 20 - Past Perfect',      subtitle: 'had done · before/after/by the time · already/yet · had been doing' },
  21: { title: 'Week 21 - Telling Stories',   subtitle: 'Narrative tenses · sequencers · connectors · anecdotes' },
  22: { title: 'Week 22 - B1 Milestone',      subtitle: 'Mixed past tenses · tell your own story · phrasal verbs start' },
  23: { title: 'Week 23 - Phrasal Verbs',     subtitle: 'get · take · put · come/go · work & phone · Zero Conditional' },
  24: { title: 'Week 24 - First Conditional', subtitle: 'if + present, will · unless · time clauses · might/may/could' },
  25: { title: 'Week 25 - The Passive',       subtitle: 'be + past participle · present/past/future · by the agent' },
  26: { title: 'Week 26 - Consolidation',     subtitle: 'Present Perfect Passive · review · B1 June milestone' },
  27: { title: 'Week 27 - Reported Speech',    subtitle: 'say/tell · backshift · reported questions · commands · reporting verbs' },
  28: { title: 'Week 28 - Relative Clauses',   subtitle: 'who/which/that · whose · where/when/why · defining vs non-defining' },
  29: { title: 'Week 29 - wish & if only',     subtitle: 'wish + past · wish + past perfect · wish + would · Second Conditional' },
  30: { title: 'Week 30 - Unreal & Review',    subtitle: '2nd conditional · real-life practice · reported speech & relatives review' },
  31: { title: 'Week 31 - Milestone & 3rd Cond.', subtitle: 'July B1→B2 milestone · Third Conditional starts' },
  32: { title: 'Week 32 - Modals of Deduction', subtitle: 'must/can\'t/might be · must/can\'t have + participle · could/should/would have · speculation' },
  33: { title: 'Week 33 - Gerunds & Infinitives', subtitle: 'verb + -ing vs verb + to · change of meaning · prepositions · infinitive of purpose' },
  34: { title: 'Week 34 - Future Forms',        subtitle: 'future continuous · future perfect (continuous) · will/going to/present continuous · future in the past' },
  35: { title: 'Week 35 - August B2 Milestone', subtitle: 'conditionals & modals · patterns & future · storytelling · August milestone' },
  36: { title: 'Week 36 - Collocations',          subtitle: 'make/do · take/get · adjective+noun · business · have/pay/keep · practice & advanced' },
  37: { title: 'Week 37 - Idioms',                subtitle: 'body · weather · animal · time & money · feelings · colour & food · idioms review' },
  38: { title: 'Week 38 - Register',              subtitle: 'formal vs informal · phrasal→formal · email writing · slang · academic · context · review' },
  39: { title: 'Week 39 - Word Formation',        subtitle: 'prefixes un/re/dis/mis · over/under/pre/post · noun suffixes · adjective suffixes · word families · compounds · practice · final review' },
  40: { title: 'Week 40 - Inversion',             subtitle: 'negative adverbials · not only/no sooner · only-inversion · conditional inversion · so/such · fronting · review' },
  41: { title: 'Week 41 - Clefts & Emphasis',     subtitle: 'it-clefts · wh-clefts · all-clefts · fronting · emphatic do/does/did · intensifiers · review' },
  42: { title: 'Week 42 - Discourse Markers',     subtitle: 'contrast · addition/sequence · cause/result · clarifying · stance · spoken links · review' },
  43: { title: 'Week 43 - Advanced Structures',   subtitle: 'nominalisation · participle clauses · advanced relatives · hedging · formal connectors · style · practice' },
  44: { title: 'Week 44 - Sophistication',        subtitle: 'sophistication in context · emphasis & discourse mixed practice · Month 10 final review' },
  45: { title: 'Week 45 - The Subjunctive',       subtitle: 'mandative subjunctive · importance adjectives · were-subjunctive · fixed expressions · should/lest · subjunctive vs indicative · review' },
  46: { title: 'Week 46 - Ellipsis',              subtitle: 'ellipsis basics · verb-phrase ellipsis · so/neither/nor · substitution · comparatives · replies & tags · review' },
  47: { title: 'Week 47 - Academic Writing',      subtitle: 'impersonal tone · reporting & citation · cohesion · hedging & boosting · defining · argument structure · review' },
  48: { title: 'Week 48 - Nuance',                subtitle: 'connotation · euphemism · collocation · shades of certainty · irony & litotes · precision verbs · review' },
  49: { title: 'Week 49 - Nuance & Mastery',      subtitle: 'nuance & academic mixed practice · Month 11 final review' },
  50: { title: 'Week 50 - Figurative Language',   subtitle: 'metaphor & simile · personification/metonymy · hyperbole & irony · symbolism · idioms · allusion · practice' },
  51: { title: 'Week 51 - Rhetoric',              subtitle: 'ethos/pathos/logos · repetition · antithesis & chiasmus · rhetorical questions · climax · oratory · practice' },
  52: { title: 'Week 52 - Advanced Style',        subtitle: 'tone & voice · advanced idioms · wordplay · registers · varieties of English · concision · practice' },
  53: { title: 'Week 53 - C2 Mastery',            subtitle: 'reading & inference · paraphrase & summary · error correction · collocation · grammar synthesis · writing · certification' },
  54: { title: 'Week 54 - Certification',         subtitle: 'certification practice · FINAL TEST, Total Mastery (A1 → C2)' },
}

// ─── Month grouping (the 12-group layout) ─────────────────────────────────────
// Lessons per month - the course runs one lesson per day. Mostly tracks the
// calendar (Feb = 28 non-leap baseline), but a month may carry an extra bonus
// lesson so that every 7-lesson week stays full: March holds 32 (31 + 1 Week-13
// bonus) which also aligns the Mar→Apr boundary exactly to a week edge.
// April carries 28 (4 full weeks 14–17) so every 7-lesson week stays full and the
// Mar→Apr→May boundaries land exactly on week edges (91 → 119, both multiples of 7).
export const DAYS_PER_MONTH = [31, 28, 32, 28, 31, 31, 31, 31, 31, 31, 30, 31]

// Cumulative lesson count at the END of each month (1-indexed: month N → sum of
// DAYS_PER_MONTH[0..N-1]). MONTH_END_INDEX[1] = lessons through the end of month 2.
const MONTH_END_INDEX = DAYS_PER_MONTH.reduce<number[]>((acc, d, i) => {
  acc.push((acc[i - 1] ?? 0) + d)
  return acc
}, [])

// ── Single source of truth for lesson unlocking ───────────────────────────────
// Both the Dashboard and the Lessons page call this, so the "X / total unlocked"
// number can never disagree between the two screens. Plan + time set the pace
// (see planUnlockCount); an admin `unlock_override_month` is a HARD CAP that
// opens exactly months 1..N and locks everything after, overriding the plan.
export function userUnlockedCount(
  user: { plan?: PlanType | null; created_at?: string | null; unlock_override_month?: number | null } | null | undefined,
): number {
  const total = LESSON_SEQUENCE.length
  const enrolledAt = user?.created_at ? new Date(user.created_at) : new Date()
  const daysElapsed = Math.max(0, Math.floor((Date.now() - enrolledAt.getTime()) / 86_400_000))
  const planUnlocked = planUnlockCount(user?.plan, daysElapsed, total)
  const override = user?.unlock_override_month ?? null
  return override != null
    ? Math.min(total, MONTH_END_INDEX[override - 1] ?? planUnlocked)
    : Math.min(total, planUnlocked)
}

export interface MonthMeta {
  month: number
  name: string
  level: string
  title: string
  subtitle: string
  accent: string
}

// Metadata for all 12 months - the full A1 → C2 yearly journey.
export const MONTH_INFO: Record<number, MonthMeta> = {
  1:  { month: 1,  name: 'January',   level: 'A1',     accent: '#60a5fa', title: 'Foundation: Speak From Zero',      subtitle: 'To Be · Present · Past · Future basics' },
  2:  { month: 2,  name: 'February',  level: 'A1',     accent: '#60a5fa', title: 'Completing the Base',              subtitle: 'Modal verbs · Questions · Everyday vocabulary' },
  3:  { month: 3,  name: 'March',     level: 'A2',     accent: '#34d399', title: 'Everyday Life',                    subtitle: 'Articles · Prepositions · Quantifiers · Connectors' },
  4:  { month: 4,  name: 'April',     level: 'A2',     accent: '#34d399', title: 'Present Perfect & Comparing',      subtitle: 'Have you ever…? · Comparatives · Adverbs' },
  5:  { month: 5,  name: 'May',       level: 'B1',     accent: '#fbbf24', title: 'Telling Stories in the Past',      subtitle: 'Past Continuous · used to · Past Perfect' },
  6:  { month: 6,  name: 'June',      level: 'B1',     accent: '#fbbf24', title: 'Phrasal Verbs & Conditionals',     subtitle: 'Phrasal verbs · Zero & First Conditional · Passive' },
  7:  { month: 7,  name: 'July',      level: 'B1→B2', accent: '#fbbf24', title: 'Reported Speech & Relatives',      subtitle: 'Reported speech · Relative clauses · wish' },
  8:  { month: 8,  name: 'August',    level: 'B2',     accent: '#f59e0b', title: 'Hypotheticals & Advanced Passive', subtitle: 'Third/Mixed Conditionals · Modal perfects' },
  9:  { month: 9,  name: 'September', level: 'B2',     accent: '#f59e0b', title: 'Rich Vocabulary & Register',       subtitle: 'Collocations · Idioms · Formal vs informal' },
  10: { month: 10, name: 'October',   level: 'C1',     accent: '#f472b6', title: 'Sophistication & Emphasis',        subtitle: 'Inversion · Cleft sentences · Discourse markers' },
  11: { month: 11, name: 'November',  level: 'C1→C2', accent: '#c084fc', title: 'Nuance & Academic English',        subtitle: 'Subjunctive · Ellipsis · Academic writing' },
  12: { month: 12, name: 'December',  level: 'C2',     accent: '#c084fc', title: 'Total Mastery & Certification',    subtitle: 'Figurative language · Rhetoric · Final test' },
}

/** Map a 1-based day-of-year (1–365) to its calendar month (1–12). */
export function dayToMonth(day: number): number {
  let remaining = day
  for (let m = 0; m < DAYS_PER_MONTH.length; m++) {
    if (remaining <= DAYS_PER_MONTH[m]) return m + 1
    remaining -= DAYS_PER_MONTH[m]
  }
  return 12
}

/** Group every lesson in LESSON_SEQUENCE into its calendar month (1–12),
 *  attaching the derived `month` field to each lesson. Drives the grouped UI. */
export function getLessonsByMonth(): Record<number, LessonDef[]> {
  const byMonth: Record<number, LessonDef[]> = {}
  LESSON_SEQUENCE.forEach((id, i) => {
    const lesson = LESSONS[id]
    if (!lesson) return
    const month = dayToMonth(i + 1)
    byMonth[month] = byMonth[month] ?? []
    byMonth[month].push({ ...lesson, month })
  })
  return byMonth
}

export function getLesson(id: string): LessonDef {
  return LESSONS[id] ?? LESSONS['w1d5']
}

export function getAllLessons(): LessonDef[] {
  return LESSON_SEQUENCE.map(id => LESSONS[id]).filter(Boolean)
}
