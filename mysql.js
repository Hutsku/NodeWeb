
var mysql      = require('mysql');
var connection = mysql.createConnection({
	host     : 'localhost',
	user     : 'root',
	password : '',
	database : 'ydogbe'
});

var sqlTable = 'SELECT * FROM users';
var addUser = 'INSERT INTO users (id, name, password, subscribe_date) VALUES (NULL, "John", "Casserole", NOW())';

connection.query(addUser, function(err, rows, fields) {
	if (err) throw err;
	console.log(rows);
});

connection.end();
