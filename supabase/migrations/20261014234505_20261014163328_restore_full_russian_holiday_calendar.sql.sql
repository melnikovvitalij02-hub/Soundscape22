-- Restore the full Russian holiday calendar for the События page.
-- Adds the holidays that were part of the original design but are missing
-- from the live seasonal_events table: Old New Year, Valentine's Day,
-- Defender of the Fatherland Day, International Women's Day is already present,
-- Spring and Labour, Russia Day, Day of Knowledge, National Unity Day.

INSERT INTO seasonal_events (name, description, start_date, end_date, theme, bonus_xp_multiplier, is_active)
VALUES
  ('Старый Новый год', 'Новогоднее настроение продолжается — бонус XP', '2027-01-13', '2027-01-14', 'newyear', 1.5, true),
  ('День Святого Валентина', 'Романтические биты и нежные мелодии — двойной XP', '2027-02-13', '2027-02-15', 'valentine', 2.0, true),
  ('День защитника Отечества', '23 февраля — сильные биты, мощный ритм', '2027-02-23', '2027-02-23', 'victory', 1.5, true),
  ('Праздник Весны и Труда', '1 мая — творчество и созидание', '2027-05-01', '2027-05-01', 'spring', 1.5, true),
  ('День России', '12 июня — праздник страны', '2027-06-12', '2027-06-12', 'victory', 1.5, true),
  ('День народного единства', '4 ноября — вместе мы сильнее', '2026-11-04', '2026-11-04', 'victory', 1.5, true),
  ('День знаний', '1 сентября — новый учебный год, новые биты', '2027-09-01', '2027-09-01', 'spring', 1.5, true)
ON CONFLICT DO NOTHING;
