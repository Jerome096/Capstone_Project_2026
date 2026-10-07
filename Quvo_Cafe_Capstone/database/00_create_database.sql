-- Creates the database only when absent; SQL Server 2022 or newer is required.
USE [master];
GO
IF DB_ID(N'QuvoCafeDB') IS NULL
    CREATE DATABASE [QuvoCafeDB] COLLATE SQL_Latin1_General_CP1_CI_AS;
GO
