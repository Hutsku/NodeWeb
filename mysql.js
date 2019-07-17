
var mysql      = require('mysql');
var connection = mysql.createConnection({
	host     : 'localhost',
	user     : 'root',
	password : '',
	database : 'database_test'
});

var sqlDatabase = 'CREATE DATABASE dbtest';

connection.query(sqlTable, function(err, rows, fields) {
	if (err) throw err;
	console.log('Database created');
});

connection.end();
