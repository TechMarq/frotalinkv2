-- migration: add tipo_id to manutencao_itens and make it optional on manutencoes
ALTER TABLE manutencao_itens ADD COLUMN IF NOT EXISTS tipo_id UUID REFERENCES manutencao_tipos(id);

-- Optional: Copy existing tipo_id from manutencoes to its items if it is NULL
UPDATE manutencao_itens mi
SET tipo_id = m.tipo_id
FROM manutencoes m
WHERE mi.manutencao_id = m.id AND mi.tipo_id IS NULL;
