-- Question bank (all unique questions produced by the Python ingestion pipeline)
CREATE TABLE questions (
  id            TEXT PRIMARY KEY,
  question      TEXT NOT NULL,
  options       TEXT[] NOT NULL,
  answer        TEXT NOT NULL CHECK (answer IN ('A','B','C','D')),
  explanation   TEXT,
  difficulty    TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard','expert')),
  topic         TEXT,
  domain        INTEGER NOT NULL CHECK (domain IN (1,2,3)),
  source_id     TEXT,
  chunk_index   INTEGER,
  video_segment TEXT
);

-- Curated exam sets — ordered lists of question IDs
CREATE TABLE exams (
  id           TEXT PRIMARY KEY,
  question_ids TEXT[] NOT NULL
);

-- Public read — any visitor (anon or authenticated) can fetch study content
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions_public_read" ON questions FOR SELECT USING (true);
CREATE POLICY "exams_public_read"     ON exams    FOR SELECT USING (true);
