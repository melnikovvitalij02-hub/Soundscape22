/*
# Lower shop prices

Reduces prices on sample_packs, cosmetic_items, and boost_items
to reasonable values. Existing rows are updated in place.
No schema changes — only data updates.
*/

-- Sample packs: 120-250 → 15-40
UPDATE sample_packs SET price_coins = 20 WHERE name = 'Trap Galaxy';
UPDATE sample_packs SET price_coins = 15 WHERE name = 'House Vibes';
UPDATE sample_packs SET price_coins = 12 WHERE name = 'Lo-Fi Dreams';
UPDATE sample_packs SET price_coins = 25 WHERE name = 'Phonk Underground';
UPDATE sample_packs SET price_coins = 18 WHERE name = 'Hip-Hop Classic';

-- Cosmetics: 80-500 → 10-50
UPDATE cosmetic_items SET price_coins = 10 WHERE name = 'Неоновая рамка';
UPDATE cosmetic_items SET price_coins = 25 WHERE name = 'Золотой профиль';
UPDATE cosmetic_items SET price_coins = 15 WHERE name = 'Тёмная тема секвенсора';
UPDATE cosmetic_items SET price_coins = 50 WHERE name = 'Алмазная рамка';
UPDATE cosmetic_items SET price_coins = 20 WHERE name = 'Эффект конфетти';
UPDATE cosmetic_items SET price_coins = 15 WHERE name = 'Ретро скин';

-- Boosts: 30-100 → 5-15
UPDATE boost_items SET price_coins = 5 WHERE name = 'Мгновенный экспорт';
UPDATE boost_items SET price_coins = 15 WHERE name = 'Приоритет в ленте';
UPDATE boost_items SET price_coins = 10 WHERE name = 'Двойной XP';
UPDATE boost_items SET price_coins = 5 WHERE name = 'Приоритетная загрузка';
