-- ============================================================
-- Таблица поддержки авторов (донаты между пользователями)
-- ============================================================
CREATE TABLE IF NOT EXISTS support_donations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INT NOT NULL CHECK (amount >= 10),
  currency TEXT NOT NULL CHECK (currency IN ('coin', 'gem')),
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_support_donations_supporter ON support_donations(supporter_id);
CREATE INDEX IF NOT EXISTS idx_support_donations_creator ON support_donations(creator_id);
CREATE INDEX IF NOT EXISTS idx_support_donations_created ON support_donations(created_at DESC);

-- RLS политики
ALTER TABLE support_donations ENABLE ROW LEVEL SECURITY;

-- Все авторизованные могут читать донаты
CREATE POLICY "support_donations_select"
ON support_donations FOR SELECT
TO authenticated
USING (true);

-- Только авторизованные могут создавать донаты (и только от своего имени)
CREATE POLICY "support_donations_insert"
ON support_donations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = supporter_id);

-- Запрет на обновление и удаление (история донатов неизменна)
-- Никаких политик FOR UPDATE и FOR DELETE не создаём — операции запрещены