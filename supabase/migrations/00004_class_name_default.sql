-- Republic of FLOW — align class_name with the values the UI filters on
--
-- 00001 originally created the column with `default '26'`. That default was
-- later corrected in the migration file to 'Class 26', but 00001 had already
-- been applied, so the live database kept the old default and the auth trigger
-- has been stamping '26' on every profile created since.
--
-- The People screen filters on the literal strings 'Class 26' / 'Class 27', so
-- those members matched neither filter: 13 of 27 profiles — every real member
-- who had signed up — were visible only under "All", including when they
-- filtered by their own class.
--
-- Editing an applied migration only fixes a database built from scratch. The
-- running one needs its own statement.

alter table profiles
  alter column class_name set default 'Class 26';

-- Bring existing rows onto the same values. Anything already correct, or set
-- to something else deliberately, is left alone.
update profiles set class_name = 'Class 26' where class_name = '26';
update profiles set class_name = 'Class 27' where class_name = '27';
