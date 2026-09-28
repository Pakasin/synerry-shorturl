CREATE USER gateway_user WITH PASSWORD 'gateway_pass';
CREATE DATABASE gateway_db OWNER gateway_user;
REVOKE CONNECT ON DATABASE gateway_db FROM PUBLIC;

CREATE USER analytics_user WITH PASSWORD 'analytics_pass';
CREATE DATABASE analytics_db OWNER analytics_user;
REVOKE CONNECT ON DATABASE analytics_db FROM PUBLIC;

CREATE DATABASE gateway_test OWNER gateway_user;
REVOKE CONNECT ON DATABASE gateway_test FROM PUBLIC;

CREATE DATABASE analytics_test OWNER analytics_user;
REVOKE CONNECT ON DATABASE analytics_test FROM PUBLIC;
