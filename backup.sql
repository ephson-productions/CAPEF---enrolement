--
-- PostgreSQL database dump
--

\restrict pUboWc2UflorexZHc73hJZRzEsE5A2SSOPH8Yet1WI0UTh7HWZUtnCfgwCrKbDR

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: arrondissements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.arrondissements (
    id integer NOT NULL,
    department_id integer NOT NULL,
    name text NOT NULL
);


ALTER TABLE public.arrondissements OWNER TO postgres;

--
-- Name: arrondissements_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.arrondissements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.arrondissements_id_seq OWNER TO postgres;

--
-- Name: arrondissements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.arrondissements_id_seq OWNED BY public.arrondissements.id;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.departments (
    id integer NOT NULL,
    region_id integer NOT NULL,
    name text NOT NULL
);


ALTER TABLE public.departments OWNER TO postgres;

--
-- Name: departments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.departments_id_seq OWNER TO postgres;

--
-- Name: departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;


--
-- Name: members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.members (
    id integer NOT NULL,
    member_number text NOT NULL,
    member_type text NOT NULL,
    category text NOT NULL,
    individual_or_org text DEFAULT 'individuel'::text NOT NULL,
    region_id integer,
    department_id integer,
    arrondissement_id integer,
    village text,
    gps_lat double precision,
    gps_lng double precision,
    created_by_id integer NOT NULL,
    physique_data jsonb,
    morale_data jsonb,
    category_data jsonb,
    badge_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.members OWNER TO postgres;

--
-- Name: members_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.members_id_seq OWNER TO postgres;

--
-- Name: members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.members_id_seq OWNED BY public.members.id;


--
-- Name: regions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.regions (
    id integer NOT NULL,
    name text NOT NULL
);


ALTER TABLE public.regions OWNER TO postgres;

--
-- Name: regions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.regions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.regions_id_seq OWNER TO postgres;

--
-- Name: regions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.regions_id_seq OWNED BY public.regions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    clerk_user_id text NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    role text DEFAULT 'agent'::text NOT NULL,
    region_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: arrondissements id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.arrondissements ALTER COLUMN id SET DEFAULT nextval('public.arrondissements_id_seq'::regclass);


--
-- Name: departments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);


--
-- Name: members id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members ALTER COLUMN id SET DEFAULT nextval('public.members_id_seq'::regclass);


--
-- Name: regions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regions ALTER COLUMN id SET DEFAULT nextval('public.regions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: arrondissements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.arrondissements (id, department_id, name) FROM stdin;
1	4	Ngaoundéré 1er
2	4	Ngaoundéré 2ème
3	4	Ngaoundéré 3ème
4	4	Belel
5	4	Martap
6	4	Mbe
7	4	Nyambaka
8	12	Yaoundé 1er
9	12	Yaoundé 2ème
10	12	Yaoundé 3ème
11	12	Yaoundé 4ème
12	12	Yaoundé 5ème
13	12	Yaoundé 6ème
14	12	Yaoundé 7ème
15	19	Bertoua 1er
16	19	Bertoua 2ème
17	19	Doumé
18	19	Doumaintang
19	19	Ngoura
20	20	Maroua 1er
21	20	Maroua 2ème
22	20	Maroua 3ème
23	20	Bogo
24	20	Gazawa
25	20	Meri
26	20	Ndoukoula
27	29	Douala 1er
28	29	Douala 2ème
29	29	Douala 3ème
30	29	Douala 4ème
31	29	Douala 5ème
32	26	Nkongsamba 1er
33	26	Nkongsamba 2ème
34	26	Nkongsamba 3ème
35	26	Melong
36	26	Loum
37	26	Manjo
38	30	Garoua 1er
39	30	Garoua 2ème
40	30	Garoua 3ème
41	30	Bibemi
42	30	Dembo
43	30	Lagdo
44	38	Bamenda 1er
45	38	Bamenda 2ème
46	38	Bamenda 3ème
47	38	Bafut
48	38	Bali
49	38	Santa
50	38	Tubah
51	46	Bafoussam 1er
52	46	Bafoussam 2ème
53	46	Bafoussam 3ème
54	48	Foumban
55	48	Foumbot
56	48	Koutaba
57	48	Kouoptamo
58	50	Ebolowa 1er
59	50	Ebolowa 2ème
60	50	Biwong-Bane
61	50	Mvangan
62	50	Sangmelima
63	53	Buea
64	53	Limbe 1er
65	53	Limbe 2ème
66	53	Limbe 3ème
67	53	Muyuka
68	53	Tiko
69	56	Mamfe
70	56	Akwaya
71	56	Eyumojock
72	56	Tinto
73	17	Abong-Mbang
74	17	Angossas
75	17	Doumaintang
76	17	Mboma
77	17	Messamena
78	7	Monatélé
79	7	Batchenga
80	7	Ebebda
81	7	Evodoula
82	7	Obala
83	49	Sangmelima
84	49	Bengbis
85	49	Djoum
86	49	Mintom
87	49	Meyomessi
\.


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.departments (id, region_id, name) FROM stdin;
1	1	Faro-et-Déo
2	1	Mayo-Banyo
3	1	Mbéré
4	1	Vina
5	1	Djérem
6	2	Haute-Sanaga
7	2	Lékié
8	2	Mbam-et-Inoubou
9	2	Mbam-et-Kim
10	2	Méfou-et-Afamba
11	2	Méfou-et-Akono
12	2	Mfoundi
13	2	Nyong-et-Kellé
14	2	Nyong-et-Mfoumou
15	2	Nyong-et-So'o
16	3	Boumba-et-Ngoko
17	3	Haut-Nyong
18	3	Kadey
19	3	Lom-et-Djérem
20	4	Diamaré
21	4	Logone-et-Chari
22	4	Mayo-Danay
23	4	Mayo-Kani
24	4	Mayo-Sava
25	4	Mayo-Tsanaga
26	5	Moungo
27	5	Nkam
28	5	Sanaga-Maritime
29	5	Wouri
30	6	Bénoué
31	6	Faro
32	6	Mayo-Louti
33	6	Mayo-Rey
34	7	Boyo
35	7	Bui
36	7	Donga-Mantung
37	7	Menchum
38	7	Mezam
39	7	Momo
40	7	Ngo-Ketunjia
41	8	Bamboutos
42	8	Haut-Nkam
43	8	Hauts-Plateaux
44	8	Koupé-Manengouba
45	8	Menoua
46	8	Mifi
47	8	Ndé
48	8	Noun
49	9	Dja-et-Lobo
50	9	Mvila
51	9	Océan
52	9	Vallée-du-Ntem
53	10	Fako
54	10	Koupé-Muanenguba
55	10	Lebialem
56	10	Manyu
57	10	Meme
58	10	Ndian
\.


--
-- Data for Name: members; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.members (id, member_number, member_type, category, individual_or_org, region_id, department_id, arrondissement_id, village, gps_lat, gps_lng, created_by_id, physique_data, morale_data, category_data, badge_url, created_at, updated_at) FROM stdin;
1	CAPEF-AGR-000001	physique	agriculteur	individuel	5	29	27	ijktftj	\N	\N	1	{"nom": "GILHOUBE LEZAHBO", "sexe": "M", "prenom": "EPHRAIM", "civilite": "M.", "numeroCni": "", "telephone1": "697919470"}	\N	{"cultures": "", "superficie": "", "description": ""}	data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iYmciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdHlsZT0ic3RvcC1jb2xvcjojMTY2NTM0O3N0b3Atb3BhY2l0eToxIiAvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiMxNDUzMmQ7c3RvcC1vcGFjaXR5OjEiIC8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogIDwvZGVmcz4KICA8cmVjdCB3aWR0aD0iMzIwIiBoZWlnaHQ9IjIwMCIgcng9IjEyIiBmaWxsPSJ1cmwoI2JnKSIvPgogIDxyZWN0IHg9IjEyIiB5PSIxMiIgd2lkdGg9IjI5NiIgaGVpZ2h0PSIxNzYiIHJ4PSI4IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMSIgc3Ryb2tlLW9wYWNpdHk9IjAuMyIvPgogIDx0ZXh0IHg9IjE2MCIgeT0iMzgiIGZvbnQtZmFtaWx5PSJBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjExIiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0iI2ZmZmZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgb3BhY2l0eT0iMC44Ij5DSEFNQlJFIEQnQUdSSUNVTFRVUkUsIERFIExBIFDDikNIRSBFVCBERVMgRk9Sw4pUUzwvdGV4dD4KICA8dGV4dCB4PSIxNjAiIHk9IjU0IiBmb250LWZhbWlseT0iQXJpYWwsc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiNmYmJmMjQiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkNBUEVGIENBTUVST1VOPC90ZXh0PgogIDxsaW5lIHgxPSIzMCIgeTE9IjYyIiB4Mj0iMjkwIiB5Mj0iNjIiIHN0cm9rZT0iI2ZmZmZmZiIgc3Ryb2tlLXdpZHRoPSIwLjUiIHN0cm9rZS1vcGFjaXR5PSIwLjMiLz4KICA8dGV4dCB4PSIxNjAiIHk9Ijg2IiBmb250LWZhbWlseT0iQXJpYWwsc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiNmZmZmZmYiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkdJTEhPVUJFIExFWkFIQk8gRVBIUkFJTTwvdGV4dD4KICA8dGV4dCB4PSIxNjAiIHk9IjEwNCIgZm9udC1mYW1pbHk9IkFyaWFsLHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTEiIGZpbGw9IiNkMWZhZTUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkFHUklDVUxURVVSIOKAlCBQZXJzb25uZSBQaHlzaXF1ZTwvdGV4dD4KICA8dGV4dCB4PSIxNjAiIHk9IjEyMCIgZm9udC1mYW1pbHk9IkFyaWFsLHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTAiIGZpbGw9IiNiYmY3ZDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkxpdHRvcmFsPC90ZXh0PgogIDxyZWN0IHg9IjIzMCIgeT0iMTMwIiB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSI0IiBmaWxsPSIjZmZmZmZmIi8+CiAgPHRleHQgeD0iMjYyIiB5PSIxNjUiIGZvbnQtZmFtaWx5PSJBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjYiIGZpbGw9IiMxNjY1MzQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtd2VpZ2h0PSJib2xkIj5RUiBDT0RFPC90ZXh0PgogIDx0ZXh0IHg9IjI2MiIgeT0iMTc1IiBmb250LWZhbWlseT0iQXJpYWwsc2Fucy1zZXJpZiIgZm9udC1zaXplPSI1IiBmaWxsPSIjMTY2NTM0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5DQVBFRi1BR1ItMDAwMDAxPC90ZXh0PgogIDx0ZXh0IHg9IjEyMCIgeT0iMTQ4IiBmb250LWZhbWlseT0iQXJpYWwsc2Fucy1zZXJpZiIgZm9udC1zaXplPSI5IiBmaWxsPSIjYmJmN2QwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5OwrAgTUVNQlJFPC90ZXh0PgogIDx0ZXh0IHg9IjEyMCIgeT0iMTY0IiBmb250LWZhbWlseT0iQXJpYWwsc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMyIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiNmYmJmMjQiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkNBUEVGLUFHUi0wMDAwMDE8L3RleHQ+CiAgPHRleHQgeD0iMTIwIiB5PSIxODYiIGZvbnQtZmFtaWx5PSJBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjgiIGZpbGw9IiM2ZWU3YjciIHRleHQtYW5jaG9yPSJtaWRkbGUiPkVucsO0bMOpIGxlIDIwMjYtMDctMjg8L3RleHQ+Cjwvc3ZnPg==	2026-07-28 00:36:12.906393+00	2026-07-29 16:12:33.661+00
\.


--
-- Data for Name: regions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.regions (id, name) FROM stdin;
1	Adamaoua
2	Centre
3	Est
4	Extrême-Nord
5	Littoral
6	Nord
7	Nord-Ouest
8	Ouest
9	Sud
10	Sud-Ouest
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, clerk_user_id, email, name, role, region_id, created_at, updated_at) FROM stdin;
1	user_3H6RUAYXPu8Fxp3W5fO3bwV8xUM	ephsonlazab@gmail.com	EPHRAIM GILHOUBE LEZAHBO	admin	\N	2026-07-27 21:09:07.576459+00	2026-07-27 21:09:07.576459+00
3	user_3H6wJlXlGsxbqUkC3WSbSn0XlGx	ephsonproductions@gmail.com	Ephson Productions	supervisor	\N	2026-07-28 01:22:42.484438+00	2026-07-28 10:25:16.493+00
\.


--
-- Name: arrondissements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.arrondissements_id_seq', 87, true);


--
-- Name: departments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.departments_id_seq', 58, true);


--
-- Name: members_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.members_id_seq', 1, true);


--
-- Name: regions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.regions_id_seq', 10, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- Name: arrondissements arrondissements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.arrondissements
    ADD CONSTRAINT arrondissements_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: members members_member_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_member_number_unique UNIQUE (member_number);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: regions regions_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_name_unique UNIQUE (name);


--
-- Name: regions regions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_pkey PRIMARY KEY (id);


--
-- Name: users users_clerk_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_clerk_user_id_unique UNIQUE (clerk_user_id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- PostgreSQL database dump complete
--

\unrestrict pUboWc2UflorexZHc73hJZRzEsE5A2SSOPH8Yet1WI0UTh7HWZUtnCfgwCrKbDR

