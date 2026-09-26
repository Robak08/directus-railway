-- Parameterized Krakow backfill templates (Branch B).
-- Execute via migration runner / operator-reviewed psql session.

-- :krakow_destination_id
-- :krakow_guidebook_id

UPDATE places SET destination_id = :'krakow_destination_id' WHERE destination_id IS NULL;
UPDATE events SET destination_id = :'krakow_destination_id' WHERE destination_id IS NULL;
UPDATE tours SET destination_id = :'krakow_destination_id' WHERE destination_id IS NULL;
UPDATE places_regions SET destination_id = :'krakow_destination_id' WHERE destination_id IS NULL;

INSERT INTO guidebooks_places (id, guidebook_id, places_id)
SELECT gen_random_uuid(), :'krakow_guidebook_id', p.id FROM places p
ON CONFLICT DO NOTHING;

INSERT INTO guidebooks_events (id, guidebook_id, events_id)
SELECT gen_random_uuid(), :'krakow_guidebook_id', e.id FROM events e
ON CONFLICT DO NOTHING;

INSERT INTO guidebooks_tours (id, guidebook_id, tours_id)
SELECT gen_random_uuid(), :'krakow_guidebook_id', t.id FROM tours t
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS guidebooks_places_guide_idx ON guidebooks_places (guidebook_id);
CREATE UNIQUE INDEX IF NOT EXISTS guidebooks_places_pair_uq ON guidebooks_places (guidebook_id, places_id);
CREATE UNIQUE INDEX IF NOT EXISTS tips_guidebooks_pair_uq ON tips_guidebooks (tips_id, guidebooks_id);
