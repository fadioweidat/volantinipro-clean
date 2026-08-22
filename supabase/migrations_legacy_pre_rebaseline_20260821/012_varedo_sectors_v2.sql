-- Migration 012: Improved operational sectors for Varedo
-- Uses asymmetric 2x2 grid (45% lon / 52% lat split) for more natural zones.
-- Replaces the symmetric grid from migration 011.

delete from public.map_sectors
  where municipality_code = '108045' and service_type = 'd2d';

insert into public.map_sectors
  (service_type, municipality_code, sector_number, sector_name, geometry)
values
  ('d2d', '108045', 1, 'Centro',
  ST_GeomFromText('MULTIPOLYGON(((
      9.16413723 45.59897880,
      9.14653453 45.59897880,
      9.14738417 45.59915952,
      9.15033670 45.60046080,
      9.15110955 45.60176492,
      9.15317937 45.60406904,
      9.15753304 45.60605425,
      9.16133411 45.60729057,
      9.16413723 45.60761766,
      9.16413723 45.59897880
    )))', 4326)),
  ('d2d', '108045', 2, 'Zona Stazione',
  ST_GeomFromText('MULTIPOLYGON(((
      9.17483355 45.60741516,
      9.17476431 45.60709956,
      9.17457300 45.60622745,
      9.17666264 45.60526562,
      9.18151645 45.60456043,
      9.18819532 45.60030707,
      9.18856230 45.59935550,
      9.18798388 45.59897880,
      9.16413723 45.59897880,
      9.16413723 45.60761766,
      9.16591103 45.60782464,
      9.16720286 45.60793517,
      9.17012173 45.60694524,
      9.17483974 45.60854203,
      9.17595676 45.60931557,
      9.17483355 45.60741516
    )))', 4326)),
  ('d2d', '108045', 3, 'Zona Ovest',
  ST_GeomFromText('MULTIPOLYGON(((
      9.16413723 45.59897880,
      9.16413723 45.59157227,
      9.16294837 45.59154154,
      9.15074439 45.58893630,
      9.14676824 45.58778063,
      9.14415307 45.59889362,
      9.14515226 45.59868531,
      9.14552434 45.59876408,
      9.14568068 45.59879718,
      9.14653453 45.59897880,
      9.16413723 45.59897880
    )))', 4326)),
  ('d2d', '108045', 4, 'Zona Est',
  ST_GeomFromText('MULTIPOLYGON(((
      9.18798388 45.59897880,
      9.17691858 45.59177241,
      9.17082243 45.59174506,
      9.16413723 45.59157227,
      9.16413723 45.59897880,
      9.18798388 45.59897880
    )))', 4326));

-- Verify:
-- select sector_number, sector_name,
--        round(st_area(geometry::geography)/1e6, 3) as area_km2,
--        st_npoints(geometry) as n_points
-- from public.map_sectors
-- where municipality_code = '108045'
-- order by sector_number;
