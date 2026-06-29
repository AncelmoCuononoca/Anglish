-- ============================================================
--  ANGLISH AI - Seed: Mês 1, A1 Beginner
--  Semana 1: Verb To Be
-- ============================================================

INSERT INTO public.lessons (level, week, day, title, description, topic, xp_reward, content) VALUES

-- Semana 1, Dia 1
('A1', 1, 1, 'Verb To Be - Introduction',
 'Learn the most fundamental verb in English',
 'Verb To Be', 50,
 '[
   {"type":"intro","title":"Grammar","body":"The verb ''To Be'' is the most important verb in English. It has 3 forms in the present tense."},
   {"type":"table","rows":[["I","am","student"],["You","are","teacher"],["He/She/It","is","Angolan"]]},
   {"type":"tip","body":"In spoken English, we almost always use contractions: I''m, You''re, He''s, She''s, It''s."}
 ]'),

-- Semana 1, Dia 2
('A1', 1, 2, 'Verb To Be - Negatives',
 'How to make negative sentences with To Be',
 'Verb To Be', 50,
 '[
   {"type":"intro","title":"Negatives","body":"To make a negative sentence, add NOT after the verb To Be."},
   {"type":"examples","items":["I am not a doctor. → I''m not a doctor.","You are not from Brazil. → You aren''t from Brazil.","He is not happy. → He isn''t happy."]},
   {"type":"tip","body":"There are 2 negative contractions for ''are not'': aren''t and ''re not. Both are correct!"}
 ]'),

-- Semana 1, Dia 3
('A1', 1, 3, 'Verb To Be - Questions',
 'Forming yes/no questions with To Be',
 'Verb To Be', 60,
 '[
   {"type":"intro","title":"Questions","body":"To form a question, move the verb To Be BEFORE the subject."},
   {"type":"examples","items":["Am I late?","Are you a student?","Is he from Angola?","Are they ready?"]},
   {"type":"tip","body":"In short answers, always use the verb To Be: ''Yes, I am.'' / ''No, she isn''t.'' Never say ''Yes, I''m.''"}
 ]'),

-- Semana 1, Dia 4
('A1', 1, 4, 'Verb To Be - Contractions',
 'Speak naturally with contractions',
 'Verb To Be', 60,
 '[
   {"type":"intro","title":"Contractions","body":"Contractions are shorter forms used in spoken and informal English. Native speakers use them almost always."},
   {"type":"table","rows":[["I am","I''m"],["You are","You''re"],["He is","He''s"],["She is","She''s"],["It is","It''s"],["We are","We''re"],["They are","They''re"]]},
   {"type":"tip","body":"''Its'' (no apostrophe) is possessive - it means ''belonging to it''. ''It''s'' = ''It is''. Very common mistake!"},
   {"type":"examples","items":["Hi! I''m Maria. I''m from Angola.","This is Marco. He''s a teacher.","We''re learning English because it''s important."]}
 ]'),

-- Semana 1, Dia 5
('A1', 1, 5, 'Verb To Be - Short Answers',
 'Answering yes/no questions naturally',
 'Verb To Be', 70,
 '[
   {"type":"intro","title":"Short Answers","body":"In English, we rarely say just ''Yes'' or ''No'' - we add a short verb form."},
   {"type":"table","rows":[["Are you a student?","Yes, I am. / No, I''m not."],["Is she from Portugal?","Yes, she is. / No, she isn''t."],["Are they ready?","Yes, they are. / No, they aren''t."]]},
   {"type":"tip","body":"NEVER use a contraction in a positive short answer. ''Yes, I''m.'' is WRONG. The correct form is ''Yes, I am.''"}
 ]'),

-- Semana 1, Dia 6
('A1', 1, 6, 'Verb To Be - Full Practice',
 'Putting it all together in real conversation',
 'Verb To Be', 80,
 '[
   {"type":"intro","title":"Real Conversation","body":"Let''s use everything you''ve learned about Verb To Be in a real dialogue."},
   {"type":"dialogue","lines":[["A","Hi! Are you Maria?"],["B","Yes, I am! And you''re Carlos, right?"],["A","That''s right. I''m from Luanda. Where are you from?"],["B","I''m from Benguela. It''s a beautiful city!"],["A","Is your English teacher good?"],["B","Yes, she''s excellent! She''s very patient."]]},
   {"type":"tip","body":"Notice how contractions are used throughout. This is how real English speakers talk every day."}
 ]'),

-- Semana 1, Dia 7
('A1', 1, 7, 'Week 1 Review + Speaking Test',
 'Review all Verb To Be + AI voice assessment',
 'Verb To Be', 150,
 '[
   {"type":"intro","title":"Week Review","body":"Congratulations on completing Week 1! Let''s review everything you''ve learned about the Verb To Be."},
   {"type":"review","topics":["Positive: I am, You are, He/She/It is, We/They are","Negative: I''m not, You aren''t, He isn''t","Questions: Am I? Are you? Is she?","Contractions: I''m, You''re, He''s, We''re, They''re","Short answers: Yes, I am. / No, she isn''t."]},
   {"type":"speaking_test","instruction":"Record yourself answering these questions: 1) Where are you from? 2) Are you a student? 3) How old are you?"}
 ]');

-- ── Exercises para Dia 4 (Contractions) ──────────────────────
-- (busca o ID da lição primeiro)
DO $$
DECLARE v_lesson_id UUID;
BEGIN
  SELECT id INTO v_lesson_id FROM public.lessons WHERE level='A1' AND week=1 AND day=4;

  INSERT INTO public.exercises (lesson_id, type, question, options, correct_answer, explanation, xp_reward, sort_order) VALUES
  (v_lesson_id, 'multiple_choice',
   'Choose the correct contraction: "I am a student."',
   '["I''m a student.","Im a student.","I''am a student.","I am'' student."]',
   'I''m a student.',
   'The contraction of "I am" is "I''m" - the apostrophe replaces the letter A.',
   10, 1),

  (v_lesson_id, 'translation',
   'Translate to English: "Ela é professora."',
   '["She''s a teacher.","She are a teacher.","Her is teacher.","She teacher."]',
   'She''s a teacher.',
   '"She is" contracts to "She''s". We also need the article "a" before teacher.',
   10, 2),

  (v_lesson_id, 'multiple_choice',
   'Which sentence uses the WRONG contraction?',
   '["We''re from Angola.","They''re happy.","He''s at school.","You''r a friend."]',
   'You''r a friend.',
   'The correct contraction is "You''re" (You are) - not "You''r".',
   10, 3),

  (v_lesson_id, 'fill_blank',
   'Complete: "Hi! _____ Maria and _____ 22 years old."',
   '["I''m / I''m","Im / Im","I am / I''m","I''m / I are"]',
   'I''m / I''m',
   'Both blanks use "I''m" - the contraction of "I am".',
   15, 4),

  (v_lesson_id, 'multiple_choice',
   'What is the contraction of "It is raining today"?',
   '["It''s raining today.","Its raining today.","It''raining today.","It is'' raining today."]',
   'It''s raining today.',
   '"It is" → "It''s". Note: "its" (without apostrophe) is possessive - completely different meaning!',
   10, 5),

  (v_lesson_id, 'translation',
   'Translate: "Nós somos estudantes de inglês."',
   '["We''re English students.","We are english students.","We''re english student.","Us are English students."]',
   'We''re English students.',
   '"We are" → "We''re". Languages are always capitalised: English, Portuguese, French.',
   15, 6),

  (v_lesson_id, 'grammar',
   'Correct the sentence: "She''s not ready, is she''s?"',
   '["She''s not ready, is she?","She not ready, is she?","She''s not ready, isn''t she''s?","She not ready, she is?"]',
   'She''s not ready, is she?',
   'Tag questions use the pronoun without a verb after it. Never "is she''s" - just "is she?".',
   15, 7),

  (v_lesson_id, 'multiple_choice',
   'Which is correct? "_____ cold today."',
   '["It''s","Its","It is''","Is it"]',
   'It''s',
   '"It''s cold today" = "It is cold today". "Its" without apostrophe is only used for possession: "its colour".',
   10, 8);
END $$;
