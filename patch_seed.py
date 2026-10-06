import codecs

with codecs.open('apps/api/src/routes/seed.ts', 'r', 'utf-8') as f:
    content = f.read()

# Replace 'الفرع الرئيسي' for the branch manager with 'الفرع الشرقي'
content = content.replace("'الفرع الرئيسي'", "'الفرع الشرقي'")

# We need to insert loops to generate data just before `res.json({ message: 'Seed data created'...`
loop_code = """
      // Bulk Data Generation
      const firstNames = ['خالد', 'فهد', 'عبدالعزيز', 'سعود', 'تركي', 'فيصل', 'وليد', 'نايف', 'نواف', 'سلطان', 'زياد', 'طارق', 'ياسر', 'ماجد', 'بدر'];
      const lastNames = ['بن عمر', 'بن سالم', 'بن صالح', 'بن أحمد', 'بن ناصر', 'المطرفي', 'السعيد'];
      
      const randomPersons = [];
      for(let i = 0; i < 30; i++) {
        randomPersons.push({
          tenantId: newTenant._id,
          firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
          lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
          birthYear: 1960 + Math.floor(Math.random() * 40),
          isLiving: true,
          parentId: p5._id,
          imageSrc: defaultImage
        });
      }
      await Person.insertMany(randomPersons);

      const randomJoinRequests = [];
      for(let i = 0; i < 12; i++) {
        randomJoinRequests.push({
          tenantId: newTenant._id,
          fullName: firstNames[Math.floor(Math.random() * firstNames.length)] + ' ' + lastNames[Math.floor(Math.random() * lastNames.length)],
          email: `user${i}@example.com`,
          phone: `+9665551234${i.toString().padStart(2, '0')}`,
          relationship: i % 2 === 0 ? 'حفيد مباشر' : 'ابن عم',
          notes: 'مرفق جميع الأوراق المطلوبة لاعتماد حسابي في شجرة العائلة',
          documents: ['doc1.pdf']
        });
      }
      await JoinRequest.insertMany(randomJoinRequests);

      const randomUsers = [];
      for(let i = 0; i < 15; i++) {
        const isEastBranch = i % 2 === 0;
        randomUsers.push({
          name: firstNames[Math.floor(Math.random() * firstNames.length)] + ' ' + lastNames[Math.floor(Math.random() * lastNames.length)],
          email: `member${i + 10}@qabila.com`,
          passwordHash,
          role: UserRole.MEMBER,
          tenantId: newTenant._id,
          branchId: isEastBranch ? 'الفرع الشرقي' : 'الفرع الغربي'
        });
      }
      await User.insertMany(randomUsers);
"""

# Insert the loop code right before `res.json({ message: 'Seed data created', tenantId: newTenant._id });`
target = "res.json({ message: 'Seed data created', tenantId: newTenant._id });"
if target in content:
    content = content.replace(target, loop_code + "\n      " + target)

with codecs.open('apps/api/src/routes/seed.ts', 'w', 'utf-8') as f:
    f.write(content)

print("seed.ts patched successfully")
