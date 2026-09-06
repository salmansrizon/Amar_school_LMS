Student Entry & Roll Number
==========================

**Re-validated against the Student Enrollment model (map #568/#582, Wave 7).**
Every requirement below still holds exactly as written — "Section" here now
means "Class Offering" (a real id, not the class-name/section text pair this
doc was written against), and the Roll Number itself moved from `students`
onto `student_enrollments`, scoped to the currently-open Enrollments of one
Class Offering rather than the whole history of one class+section text pair
(so a Roll Number is free to be reused once its prior holder is promoted/
transferred/left, which this doc's original text never had to consider). The
increment/manual-override/independent-per-section behavior described below
is unchanged; `assign_enrollment_roll` (migration 0181) implements it,
succeeding `assign_student_roll`, which this doc originally specified
against.

The Section should be treated separately when assigning student roll numbers.

For example, if Section A currently has students up to Roll 5, adding a new student to Section B should start from Roll 1, not Roll 6.

Each new section should have its own independent roll numbering.



Roll Number Field
========================================================

Show a dedicated Roll Number field during student entry.

If the user enters 1, the next student's roll number should automatically become 2, then 3, and so on.

Add an option to define the roll-number increment.

For example, if the increment is set to 2, entering 2 should make the next roll number 4, then 6, and so on.

If the starting roll is 1 and the increment is 2, the next roll should be 3, then 5, 7, etc.

The user should be able to manually edit the roll number whenever necessary.


Default Subject Selection During Add/Entry a new Subject From Class and Curricullum Module
===========================================================================================

here is the list


1. Primary School — Classes 1–5

Common subjects:



 বাংলা 

 English 

 Mathematics / গণিত 

 Science / প্রাথমিক বিজ্ঞান 

 Bangladesh and Global Studies 

 Religion and Moral Education 

 ইসলাম ও নৈতিক শিক্ষা 

 হিন্দুধর্ম ও নৈতিক শিক্ষা 

 বৌদ্ধধর্ম ও নৈতিক শিক্ষা 

 খ্রিষ্টধর্ম ও নৈতিক শিক্ষা 

 Physical Education 

 Arts / Arts and Crafts 

 ICT / Digital Technology 

 Environment / Social Studies — depending on curriculum 

2. Secondary School — Classes 6–8

The traditional NCTB framework includes Bangla, English, Mathematics, Bangladesh and Global Studies, Science, ICT, Religion and Moral Education, Physical Education, Career Education, Arts and Crafts, plus some optional subjects. 



Common subjects:



 বাংলা 

 English 

 Mathematics 

 Science 

 Bangladesh and Global Studies 

 Information and Communication Technology 

 Religion and Moral Education 

 Physical Education and Health 

 Career Education 

 Arts and Crafts 

 Agriculture Studies 

 Home Science 

 Arabic 

 Sanskrit 

 Pali 

 Small Ethnic Group's Language and Culture 

3. Secondary — Classes 9–10 / SSC

For your database, I would include at least these subjects:



Common / compulsory



 বাংলা 

 English 

 Mathematics 

 Religion and Moral Education 

 Information and Communication Technology 

 Career Education / related curriculum subject 

 Physical Education / Health 



Science



 Physics 

 Chemistry 

 Biology 

 Higher Mathematics 

 Science 



Humanities



 History of Bangladesh and World Civilization 

 Geography and Environment 

 Economics 

 Civics and Citizenship 

 Sociology 

 Social Work 

 Logic 

 Agriculture Studies 

 Home Science 



Business Studies



 Accounting 

 Finance and Banking 

 Business Entrepreneurship 

 Business Organization and Management 



Other/optional subjects



 Agriculture Studies 

 Home Science 

 Arabic 

 Sanskrit 

 Pali 

 Higher Mathematics 

 Biology 

 Geography and Environment 

 Economics 

 Arts-related subjects 



The Dhaka Education Board's SSC subject materials specifically list Biology, Chemistry, Science, Finance, Mathematics, Civics, Bangla, Physics, Business Entrepreneurship, BGS, Islam, Geography, Higher Mathematics, Home Science, Economics, Accounting, Agriculture Studies and History of Bangladesh & World Civilization, among others. 

4. College — HSC / Classes 11–12

Science Group

 বাংলা 

 English 

 Information and Communication Technology 

 Physics 

 Chemistry 

 Biology 

 Higher Mathematics 



Depending on the student's combination, Biology/Higher Mathematics can be selected differently.

Humanities Group

 বাংলা 

 English 

 Information and Communication Technology 

 Economics 

 Civics and Good Governance 

 Logic 

 History 

 Islamic History and Culture 

 Geography 

 Sociology 

 Social Work 

 Psychology 

 Home Science 

 Statistics 

 Other approved humanities subjects 

Business Studies Group

 বাংলা 

 English 

 Information and Communication Technology 

 Accounting 

 Finance, Banking and Insurance 

 Business Organization and Management 

 Production Management and Marketing 

 Economics 

 Statistics 

 Other approved business-related subjects 



The current Dhaka Education Board HSC materials explicitly show subjects including Bangla, Physics, Civics & Good Governance, Business Organization & Management, Biology, Sociology, Higher Math, ICT, Logic, Accounting, Chemistry, Geography, Islamic History, Economics, Social Work and Production Management.



Display the available Subjects inside a selection box/dropdown.

The user should be able to select subjects directly from the box.

The user should also be able to type and enter a subject manually if it is not available in the list.